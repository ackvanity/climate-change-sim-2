// WASM entry point: the only C++ the browser sees.
// Wraps the solver in compute/greenhouse/precompute.cpp behind a small C ABI (see ../README.md).
// Tables are read from Emscripten's virtual filesystem, populated by --preload-file (see ../build.sh).

#define GREENHOUSE_AS_LIBRARY
#include "../../../compute/greenhouse/precompute.cpp"

#include <emscripten/emscripten.h>

namespace
{
  bool initialized = false;

  template <size_t N>
  void load_transmission(const char *name, CKD::Binning (&dest)[N])
  {
    std::ifstream file(std::string("precompute_bin/") + name + "_transmission.bin", std::ios::binary);
    if (!file.is_open())
      throw std::runtime_error(std::string("Transmission table for ") + name + " cannot be opened!");
    file.read(reinterpret_cast<char *>(dest), sizeof dest);
    if (static_cast<size_t>(file.gcount()) != sizeof dest)
      throw std::runtime_error(std::string("Transmission table for ") + name + " has unexpected size!");
  }
} // namespace

extern "C"
{
  constexpr int GH_NUM_LAYERS = 81; // 80 atmospheric slabs (lowest first) + surface temperature last

  // Loads tables and builds Planck/AFGL data. Returns 0 on success, -1 on failure.
  EMSCRIPTEN_KEEPALIVE int gh_init()
  {
    if (initialized)
      return 0;
    try
    {
      load_transmission("CO2", result_co2);
      load_transmission("H2O", result_h2o);
      load_transmission("O3", result_o3);
      load_transmission("CH4", result_ch4);
      load_transmission("N2O", result_n2o);
      Greenhouse::compute_planck();
      Greenhouse::compute_afgl();
    }
    catch (const std::exception &e)
    {
      std::cerr << "gh_init: " << e.what() << std::endl;
      return -1;
    }
    initialized = true;
    return 0;
  }

  // Number of doubles gh_solve writes on success.
  EMSCRIPTEN_KEEPALIVE int gh_num_layers() { return GH_NUM_LAYERS; }

  // Solves for the equilibrium temperature profile [K] (lowest layer first, surface last).
  // Returns the number of values written to out_T, or a negative value on failure.
  EMSCRIPTEN_KEEPALIVE int gh_solve(double co2_ppm, double ch4_ppm, double *out_T, int capacity)
  {
    if (!initialized)
      return -1;
    if (capacity < GH_NUM_LAYERS)
      return -2;
    try
    {
      std::vector<double> T = Greenhouse::solve_state(co2_ppm * 1e-6, ch4_ppm * 1e-6);
      int n = std::min<int>(T.size(), capacity);
      std::copy_n(T.begin(), n, out_T);
      return n;
    }
    catch (const std::exception &e)
    {
      std::cerr << "gh_solve: " << e.what() << std::endl;
      return -3;
    }
  }
}
