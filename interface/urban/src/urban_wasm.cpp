// C ABI around compute/urban/compute.cpp (the cell-grid solver) for the browser. Built together with it by build.sh.
// There is exactly one simulation at a time (ur_create replaces it). Everything crosses the boundary as numbers and
// pointers into WASM memory; urban.ts is the typed side of this file.
//
// The solver keeps the material of every cell in one array (`getCellTypes()`) and derives per-cell constants from it
// in `syncCellTypes()` (which also bakes in `dt`). Edits here only mark that state `dirty`; the sync runs once, lazily,
// before the next step, so a brush stroke of many ur_paint calls costs one pass over the grid.
#include <emscripten.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <vector>

#include "../../../compute/urban/urban.h"

namespace Urban
{
  // Defined in compute.cpp: the table that JavaScript fills with heat_transfer_rate.bin before ur_create().
  double *get_heat_transfer_rate_t_ptr();
}

namespace
{
  constexpr double INITIAL_T = 288.0; // K, until the page says otherwise
  constexpr int GROUPS = Urban::NUM_CELL_TYPES + 1; // one per material, then the whole grid
  constexpr int STAT_FIELDS = 4;                    // min, max, mean, count
  constexpr int MIN_SIZE = 3;                       // the edge handling in compute.cpp needs at least 3 rows and columns
  constexpr int MAX_SIZE = 4096;

  std::unique_ptr<Urban::Simulation> sim;
  std::vector<uint8_t> image; // RGBA output of ur_render
  int rows = 0, cols = 0;
  bool dirty = false; // cell types or dt changed since the last syncCellTypes()

  inline bool inGrid(int r, int c) { return r >= 0 && r < rows && c >= 0 && c < cols; }
  inline long cells() { return (long)rows * cols; }

  void ensureSynced()
  {
    if (sim && dirty)
    {
      sim->syncCellTypes();
      dirty = false;
    }
  }
}

extern "C"
{
  // ---- table -------------------------------------------------------------------------------------------------------

  // Where JavaScript writes heat_transfer_rate.bin (little-endian doubles, [7 CH4][21 CO2][60 T], T from 100 K in 5 K steps).
  EMSCRIPTEN_KEEPALIVE double *ur_table_ptr() { return Urban::get_heat_transfer_rate_t_ptr(); }
  EMSCRIPTEN_KEEPALIVE int ur_table_bytes() { return (int)sizeof(Urban::heat_transfer_rate_main_t); }

  // ---- lifetime ----------------------------------------------------------------------------------------------------

  // Creates (replacing any previous) a rows x cols grid of material 0 at INITIAL_T. Load the table first.
  // `colatitude` in radians (pi/2 at the equator). Returns the slot count, or -1 for invalid arguments.
  EMSCRIPTEN_KEEPALIVE int ur_create(int r, int c, double colatitude, double co2Ppm, double ch4Ppm, double dt, double S0)
  {
    if (r < MIN_SIZE || c < MIN_SIZE || r > MAX_SIZE || c > MAX_SIZE || !(dt > 0))
      return -1;
    sim.reset();
    rows = r;
    cols = c;
    image.assign((size_t)r * c * 4, 255);

    sim = std::make_unique<Urban::Simulation>(r, c, colatitude, co2Ppm, ch4Ppm, dt, S0, 2u);
    // The solver leaves cell data uninitialised: set every cell, then derive the per-cell constants.
    std::fill(sim->getCellTypes(), sim->getCellTypes() + cells(), (Urban::cell_type_t)0);
    Urban::Cell *g = sim->getCurrentGrid();
    for (long i = 0; i < cells(); i++)
      g[i].T = INITIAL_T;
    sim->propogateChanges();
    sim->syncCellTypes();
    dirty = false;
    sim->time_of_day = 0;
    return sim->getSlots();
  }

  EMSCRIPTEN_KEEPALIVE void ur_destroy()
  {
    sim.reset();
    dirty = false;
  }

  // ---- stepping and parameters -------------------------------------------------------------------------------------

  EMSCRIPTEN_KEEPALIVE void ur_step(int n)
  {
    if (!sim)
      return;
    ensureSynced();
    for (int i = 0; i < n; i++)
      sim->step();
  }

  // dt is baked into the solver's per-cell constants, so changing it marks them stale.
  EMSCRIPTEN_KEEPALIVE void ur_set_params(double dt, double S0, double colatitude)
  {
    if (!sim)
      return;
    if (dt > 0 && dt != sim->dt)
    {
      sim->dt = dt;
      dirty = true;
    }
    sim->S0 = S0;
    sim->azimuth = colatitude;
  }

  EMSCRIPTEN_KEEPALIVE void ur_set_gases(double co2Ppm, double ch4Ppm)
  {
    if (!sim)
      return;
    sim->setCo2_ppm(co2Ppm);
    sim->setCh4_ppm(ch4Ppm);
  }

  EMSCRIPTEN_KEEPALIVE void ur_set_hour(double hour)
  {
    if (sim)
      sim->time_of_day = hour;
  }
  EMSCRIPTEN_KEEPALIVE double ur_hour() { return sim ? sim->time_of_day : 0; }
  EMSCRIPTEN_KEEPALIVE int ur_rows() { return rows; }
  EMSCRIPTEN_KEEPALIVE int ur_cols() { return cols; }

  // ---- materials ---------------------------------------------------------------------------------------------------

  EMSCRIPTEN_KEEPALIVE int ur_type_count() { return Urban::NUM_CELL_TYPES; }
  // Empty name = the slot is not defined by the solver's premade set.
  EMSCRIPTEN_KEEPALIVE const char *ur_type_name(int i) { return sim && i >= 0 && i < Urban::NUM_CELL_TYPES ? sim->celldata[i].name.c_str() : ""; }
  EMSCRIPTEN_KEEPALIVE const char *ur_type_color(int i) { return sim && i >= 0 && i < Urban::NUM_CELL_TYPES ? sim->celldata[i].color.c_str() : ""; }
  // out: albedo, k_lateral, k_surface_factor, heat_capacity, uses evapotranspiration (0 or 1)
  EMSCRIPTEN_KEEPALIVE void ur_type_hot(int i, double *out)
  {
    if (!sim || i < 0 || i >= Urban::NUM_CELL_TYPES)
      return;
    const Urban::CellData &d = sim->celldata[i];
    out[0] = d.albedo;
    out[1] = d.k_lateral;
    out[2] = d.k_surface_factor;
    out[3] = d.heat_capacity;
    out[4] = d.param.use_et ? 1 : 0;
  }

  // ---- grid access -------------------------------------------------------------------------------------------------

  // out[0] = temperature in K, out[1] = material id. Returns 0 when (row, col) is outside the grid.
  EMSCRIPTEN_KEEPALIVE int ur_cell(int r, int c, double *out)
  {
    if (!sim || !inGrid(r, c))
      return 0;
    const long i = (long)r * cols + c;
    out[0] = sim->getCurrentGrid()[i].T;
    out[1] = sim->getCellTypes()[i];
    return 1;
  }

  // ---- editing -----------------------------------------------------------------------------------------------------

  // Paints a disc (shape 0) or square (shape 1) of the given radius in cells, centred on (row, col), clipped to the grid.
  EMSCRIPTEN_KEEPALIVE void ur_paint(int r0, int c0, int radius, int type, int shape)
  {
    if (!sim || type < 0 || type >= Urban::NUM_CELL_TYPES)
      return;
    Urban::cell_type_t *t = sim->getCellTypes();
    const int rad = std::max(radius, 0);
    for (int dr = -rad; dr <= rad; dr++)
      for (int dc = -rad; dc <= rad; dc++)
      {
        if (shape == 0 && dr * dr + dc * dc > rad * rad + rad)
          continue;
        const int r = r0 + dr, c = c0 + dc;
        if (inGrid(r, c))
          t[(long)r * cols + c] = (Urban::cell_type_t)type;
      }
    dirty = true;
  }

  EMSCRIPTEN_KEEPALIVE void ur_fill(int type)
  {
    if (!sim || type < 0 || type >= Urban::NUM_CELL_TYPES)
      return;
    std::fill(sim->getCellTypes(), sim->getCellTypes() + cells(), (Urban::cell_type_t)type);
    dirty = true;
  }

  // Sets every cell to the same temperature in K.
  EMSCRIPTEN_KEEPALIVE void ur_fill_temperature(double T)
  {
    if (!sim)
      return;
    Urban::Cell *g = sim->getCurrentGrid();
    for (long i = 0; i < cells(); i++)
      g[i].T = T;
    sim->propogateChanges();
  }

  // Copies rows*cols material ids (row-major, 1 byte each; out-of-range ids become 0) into the grid / reads them out.
  EMSCRIPTEN_KEEPALIVE void ur_load_types(const uint8_t *types)
  {
    if (!sim)
      return;
    Urban::cell_type_t *t = sim->getCellTypes();
    for (long i = 0; i < cells(); i++)
      t[i] = types[i] < Urban::NUM_CELL_TYPES ? types[i] : 0;
    dirty = true;
  }
  EMSCRIPTEN_KEEPALIVE void ur_read_types(uint8_t *out)
  {
    if (sim)
      std::memcpy(out, sim->getCellTypes(), (size_t)cells());
  }

  // ---- statistics --------------------------------------------------------------------------------------------------

  // out has (NUM_CELL_TYPES + 1) * 4 + 1 doubles. Group g < NUM_CELL_TYPES is that material, the last group is the whole
  // grid; each holds min, max, mean, count over the finite cells (count 0 -> the rest is NaN). The last value counts
  // cells whose temperature is not finite, so the page can notice a diverged run.
  EMSCRIPTEN_KEEPALIVE void ur_stats(double *out)
  {
    double mn[GROUPS], mx[GROUPS], sum[GROUPS];
    long cnt[GROUPS];
    for (int g = 0; g < GROUPS; g++)
    {
      mn[g] = INFINITY;
      mx[g] = -INFINITY;
      sum[g] = 0;
      cnt[g] = 0;
    }
    long bad = 0;
    if (sim)
    {
      const Urban::Cell *grid = sim->getCurrentGrid();
      const Urban::cell_type_t *types = sim->getCellTypes();
      for (long i = 0; i < cells(); i++)
      {
        const double T = grid[i].T;
        if (!std::isfinite(T))
        {
          bad++;
          continue;
        }
        const int t = types[i] < Urban::NUM_CELL_TYPES ? types[i] : 0;
        for (int g : {t, GROUPS - 1})
        {
          if (T < mn[g])
            mn[g] = T;
          if (T > mx[g])
            mx[g] = T;
          sum[g] += T;
          cnt[g]++;
        }
      }
    }
    for (int g = 0; g < GROUPS; g++)
    {
      out[g * STAT_FIELDS + 0] = cnt[g] ? mn[g] : NAN;
      out[g * STAT_FIELDS + 1] = cnt[g] ? mx[g] : NAN;
      out[g * STAT_FIELDS + 2] = cnt[g] ? sum[g] / cnt[g] : NAN;
      out[g * STAT_FIELDS + 3] = (double)cnt[g];
    }
    out[GROUPS * STAT_FIELDS] = (double)bad;
  }

  // ---- rendering ---------------------------------------------------------------------------------------------------

  // Fills and returns an RGBA image (rows*cols*4 bytes, row-major, valid until the next call).
  //  mode 0: material map. `lut` = NUM_CELL_TYPES RGBA colours.
  //  mode 1: temperature. `lut` = 256 RGBA colours, spread linearly over [lo, hi]; non-finite cells are magenta.
  EMSCRIPTEN_KEEPALIVE uint8_t *ur_render(int mode, const uint8_t *lut, double lo, double hi)
  {
    if (!sim)
      return image.data();
    const Urban::Cell *g = sim->getCurrentGrid();
    const Urban::cell_type_t *types = sim->getCellTypes();
    uint8_t *px = image.data();
    const long n = cells();
    if (mode == 0)
    {
      for (long i = 0; i < n; i++)
      {
        const int t = types[i];
        std::memcpy(px + 4 * i, lut + 4 * (t < Urban::NUM_CELL_TYPES ? t : 0), 4);
      }
    }
    else
    {
      const double scale = hi > lo ? 255.0 / (hi - lo) : 0.0;
      for (long i = 0; i < n; i++)
      {
        const double T = g[i].T;
        if (!std::isfinite(T))
        {
          px[4 * i] = 255;
          px[4 * i + 1] = 0;
          px[4 * i + 2] = 255;
          px[4 * i + 3] = 255;
          continue;
        }
        const double v = (T - lo) * scale + 0.5;
        const int idx = v <= 0 ? 0 : (v >= 255 ? 255 : (int)v);
        std::memcpy(px + 4 * i, lut + 4 * idx, 4);
      }
    }
    return px;
  }
}
