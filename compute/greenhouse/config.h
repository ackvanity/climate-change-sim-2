#include <algorithm>
#include <iterator>
#include <cmath>

namespace Config
{
  constexpr int NUM_G_POINTS = 16;

  constexpr double G_NODES[16] = {
      0.0052995325041750,
      0.0277124884633837,
      0.0671843988060841,
      0.1222977958224985,
      0.1910618777986781,
      0.2709916111713863,
      0.3591982246103705,
      0.4524937450811813,
      0.5475062549188188,
      0.6408017753896295,
      0.7290083888286136,
      0.8089381222013219,
      0.8777022041775016,
      0.9328156011939159,
      0.9722875115366163,
      0.9947004674958250,
  };

  constexpr double G_WEIGHTS[16] = {
      0.0135762297058771,
      0.0311267619693237,
      0.0475792558412463,
      0.0623144856277670,
      0.0747979944082884,
      0.0845782596975013,
      0.0913017075224618,
      0.0947253052275343,
      0.0947253052275343,
      0.0913017075224618,
      0.0845782596975013,
      0.0747979944082884,
      0.0623144856277670,
      0.0475792558412463,
      0.0311267619693237,
      0.0135762297058771,
  };

  constexpr int NUM_BINS = 22;
  constexpr double NU_START = 200;
  constexpr double BIN_WIDTHS[NUM_BINS] = {150, 150, 50, 50, 30, 30, 30, 30, 30, 50, 50, 50, 50, 50, 50, 50, 50, 100, 100, 100, 150, 400};
  constexpr double NU_STEP = 0.001;
  constexpr int MAX_LBL_ENTRIES = 400000;

}

namespace PhysicsConstants
{
  // Exact SI values (CODATA)
  constexpr double k_B = 1.380649e-23;     // Boltzmann's constant [J / K]
  constexpr double c = 299792458.0;        // Speed of light in vacuum [m / s]
  constexpr double c_sq = c * c;           // c^2 [(m / s)^2]
  constexpr double N_A = 6.02214076e23;    // Avogadro constant [mol^-1]
  constexpr double h = 6.62607015e-34;     // Planck constant [J s]
  constexpr double c2 = h * c / k_B * 100; // Second radiation constant [cm K]
}