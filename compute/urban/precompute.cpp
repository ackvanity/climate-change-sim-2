#define GREENHOUSE_AS_LIBRARY
#include <iostream>
#include "../greenhouse/greenhouse.h"
#include "urban.h"

namespace Urban
{
  double heat_transfer_rate_main_t[7][21][HEAT_TRANSFER_RATE_T_STEPS];

  // std::atomic<int> counter;

  void compute_section(int co2_idx, int ch4_idx)
  {

    double ch4 = 1.0 + 0.5 * ch4_idx;
    double co2 = 420 + 19 * co2_idx;

    std::vector<double> T(Greenhouse::n);

    for (int i = 0; i < (Greenhouse::n - 1); i++)
      T[i] = Greenhouse::afgl[i + 1][2];

    // Find J sensibility
    // Compute from the energy corrections first
    T.back() = Greenhouse::afgl[0][2];

    const double total_input = Greenhouse::inject_flux[0];
    const double avg_solar_input = 1361.0 / (4); // Standard formula
    const double k_sensible = (avg_solar_input * 0.7 - total_input) / (T.back() - T[0]);

    // So, to find total energy diff
    // energy_error + solar_input + k_sensible * (T_A - T_E), with T_A being the first atmosphere slab's temperature
    // we handle solar_input in the real code, here just precompute energy_error plus sensible term

    std::cout << k_sensible;

    return;

    for (int i = 0; i < HEAT_TRANSFER_RATE_T_STEPS; i++)
    {
      T.back() = HEAT_TRANSFER_RATE_T_START + HEAT_TRANSFER_RATE_T_STEP * i;
      heat_transfer_rate_main_t[7][21][i] = Greenhouse::compute_energy_error(T, co2 * 1e-6, ch4 * 1e-6)[0] +
                                            k_sensible * (T[0] - T.back());
    }
  }
}

int main()
{
  Greenhouse::init();
  Urban::compute_section(0, 0);
}