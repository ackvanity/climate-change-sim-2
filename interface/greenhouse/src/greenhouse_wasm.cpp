// WASM entry point: the only C++ the browser sees.
// Decodes the table precomputed by compute/greenhouse (final_result.bin) and interpolates it.
// The file layout is specified in compute/greenhouse/INTERFACE.md; the C ABI in ../README.md.
// Nothing from compute/ is compiled in: the browser never solves anything, it only looks the answer up.

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE // native builds (tests) have no Emscripten
#endif

namespace
{
  // Grid definition. Must match Greenhouse::compute() in compute/greenhouse/greenhouse.cpp (see INTERFACE.md).
  constexpr int NUM_VALUES = 81; // 80 atmospheric slabs (lowest first) + surface temperature last
  constexpr int NUM_INTERP_RANGES = 3;
  constexpr int NUM_INTERP[NUM_INTERP_RANGES] = {3, 10, 10};
  constexpr int INTERP_L[NUM_INTERP_RANGES] = {20, 31, 50};
  constexpr int INTERP_R[NUM_INTERP_RANGES] = {30, 48, 80};
  constexpr int CO2_COUNT = 21;
  constexpr double CO2_MIN_PPM = 420.0;
  constexpr double CO2_STEP_PPM = 19.0;
  constexpr int CH4_COUNT = 7;
  constexpr double CH4_MIN_PPM = 1.0;
  constexpr double CH4_STEP_PPM = 0.5;

  constexpr double CO2_MAX_PPM = CO2_MIN_PPM + CO2_STEP_PPM * (CO2_COUNT - 1);
  constexpr double CH4_MAX_PPM = CH4_MIN_PPM + CH4_STEP_PPM * (CH4_COUNT - 1);

  constexpr std::size_t TABLE_DOUBLES = static_cast<std::size_t>(CH4_COUNT) * CO2_COUNT * NUM_VALUES;
  constexpr std::size_t TABLE_BYTES = TABLE_DOUBLES * sizeof(double);

  // Plausibility window for a stored temperature [K]. The solver clamps to 160..440 K; anything else means a
  // corrupt or unfilled file (an unwritten point is all zeros).
  constexpr double T_VALID_MIN = 150.0;
  constexpr double T_VALID_MAX = 450.0;

  std::vector<double> table; // [ch4_idx][co2_idx][NUM_VALUES]

  const double *point(int co2_idx, int ch4_idx)
  {
    return table.data() + (static_cast<std::size_t>(ch4_idx) * CO2_COUNT + co2_idx) * NUM_VALUES;
  }

  // Position of v on a uniform axis: the lower node index (clamped so index + 1 exists) and the fraction towards the next node.
  void locate(double v, double min, double step, int count, int &index, double &frac)
  {
    double u = (std::clamp(v, min, min + step * (count - 1)) - min) / step;
    index = std::min(static_cast<int>(std::floor(u)), count - 2);
    frac = u - index;
  }
} // namespace

extern "C"
{
  // Size in bytes of final_result.bin that gh_init expects.
  EMSCRIPTEN_KEEPALIVE int gh_table_bytes() { return static_cast<int>(TABLE_BYTES); }

  // Decodes the table from `size` bytes at `bytes` (raw contents of final_result.bin: little-endian IEEE-754 float64,
  // which is also the byte order of WebAssembly memory, so decoding is a copy). The bytes are copied; the caller may
  // free them afterwards. Returns 0 on success, -1 null pointer, -2 wrong size, -3 non-finite or implausible values.
  EMSCRIPTEN_KEEPALIVE int gh_init(const unsigned char *bytes, int size)
  {
    if (bytes == nullptr)
      return -1;
    if (size < 0 || static_cast<std::size_t>(size) != TABLE_BYTES)
      return -2;

    std::vector<double> decoded(TABLE_DOUBLES);
    std::memcpy(decoded.data(), bytes, TABLE_BYTES);
    for (double t : decoded)
      if (!(t >= T_VALID_MIN && t <= T_VALID_MAX)) // also rejects NaN
        return -3;

    table.swap(decoded);
    return 0;
  }

  // Number of doubles gh_solve writes on success.
  EMSCRIPTEN_KEEPALIVE int gh_num_layers() { return NUM_VALUES; }

  // Writes the covered range as { co2_min, co2_max, ch4_min, ch4_max } [ppm] to out[0..3].
  EMSCRIPTEN_KEEPALIVE void gh_domain(double *out)
  {
    out[0] = CO2_MIN_PPM;
    out[1] = CO2_MAX_PPM;
    out[2] = CH4_MIN_PPM;
    out[3] = CH4_MAX_PPM;
  }

  // Equilibrium temperature profile [K] (lowest layer first, surface last) at the given gas amounts, bilinearly
  // interpolated in the precomputed table. Inputs outside the covered range are clamped to its edge.
  // Returns the number of values written to out_T, or a negative value on failure
  // (-1 not initialised, -2 capacity too small or null output, -3 non-finite input).
  EMSCRIPTEN_KEEPALIVE int gh_solve(double co2_ppm, double ch4_ppm, double *out_T, int capacity)
  {
    if (table.empty())
      return -1;
    if (out_T == nullptr || capacity < NUM_VALUES)
      return -2;
    if (!std::isfinite(co2_ppm) || !std::isfinite(ch4_ppm))
      return -3;

    int i, j;
    double fi, fj;
    locate(co2_ppm, CO2_MIN_PPM, CO2_STEP_PPM, CO2_COUNT, i, fi);
    locate(ch4_ppm, CH4_MIN_PPM, CH4_STEP_PPM, CH4_COUNT, j, fj);

    const double *p00 = point(i, j);
    const double *p10 = point(i + 1, j);
    const double *p01 = point(i, j + 1);
    const double *p11 = point(i + 1, j + 1);
    const double *base = point(0, 0);
    double out_tmp[NUM_VALUES];

    for (int k = 0; k < NUM_VALUES; k++)
    {
      double a = p00[k] + fi * (p10[k] - p00[k]);
      double b = p01[k] + fi * (p11[k] - p01[k]);
      out_tmp[k] = a + fj * (b - a) - base[k];
    }

    int interp_idx = 0;

    for (int k = 0; k < (NUM_VALUES - 1); k++)
    {
      double total = out_tmp[k];
      int sides = 0;
      while (interp_idx < NUM_INTERP_RANGES && INTERP_R[interp_idx] <= k)
        interp_idx++;

      if (interp_idx < NUM_INTERP_RANGES && INTERP_L[interp_idx] <= k)
      {
        int interp_len = NUM_INTERP[interp_idx];
        int interp_l = INTERP_L[interp_idx];
        int interp_r = INTERP_R[interp_idx];
        sides = std::min(interp_len, std::min(k - interp_l, interp_r - k));
        for (int i = 1; i <= sides; i++)
        {
          total += out_tmp[k - i];
          total += out_tmp[k + i];
        }
      }
      out_T[k] = total / (sides * 2 + 1) + base[k];
    }
    out_T[NUM_VALUES - 1] = out_tmp[NUM_VALUES - 1] + base[NUM_VALUES - 1];
    return NUM_VALUES;
  }
}
