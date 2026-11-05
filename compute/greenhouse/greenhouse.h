#ifndef GREENHOUSE_H
#include "ckd.h"
#include "config.h"
#include "Eigen/Core"

#define GREENHOUSE_H 1

namespace Greenhouse
{
  constexpr int NUM_PLANCK_POINTS = 30000;    // Number of temperature points to precompute the Planck distribution
  constexpr int PLANCK_POINTS_START = 150;    // Starting temperature (in K) to precompute the Planck distribution
  constexpr double PLANCK_POINTS_STEP = 0.01; // Steps (in K) to precompute the Planck distribution

  // Precomputed planck tables
  extern double planck[NUM_PLANCK_POINTS][Config::NUM_BINS]; // [T_idx][bins] where T = T_idx + PLANCK_POINTS_START
  extern double S0[Config::NUM_BINS];                        // Solar input (in addition to injected flux)

  constexpr int NUM_SLABS = 80;    // Number of slabs (excluding the surface) to consider when calculating atmospheric data
  constexpr int n = NUM_SLABS + 1; // Length of various vectors (+1 for surface).
  constexpr double h = 1000;       // Thickness of one slab, in meters

  // Constants about the atmosphere, assumed to be invariant with warming
  extern std::vector<std::vector<double>> afgl; // AFGL standard data, interpolated
  extern std::vector<double> vmr_o3;            // VMR of ozone, from AFGL
  extern std::vector<double> vmr_n2o;           // VMR of nitrous oxide, from AFGL
  extern std::vector<double> rh_h2o;            // Relative humidity of water, from AFGL
  extern std::vector<double> inject_flux;       // Injected flux at each layer. The main simulation does this to match AFGL data at baseline, but the `urban` simulation alters this to simulate different times of day

  // Absorption coefficients per bin, with CKD (yes, it's named Transmission because we use it to find transmission)
  struct Transmission
  {
    double T[Config::NUM_BINS][Config::NUM_G_POINTS];
  };

  // Fetches AFGL data from `afgl-1986/1f.csv` (US profile) and interpolates
  void compute_afgl();

  // Precomputes Planck distribution for slabs and the sun
  void compute_planck();

  /*
    Computes the transmission for a gas in a slab

    @param species The CKD::Species object representing the gas
    @param T Temperature of slab in Kelvin
    @param P Pressure of slab in atm
    @param vmr Mixing ratio of gas in slab

    @returns A Transmission object containing the absorption coefficient of the gas

    @note Requires the `species.result` pointer to contain precomputed data. The function hard-codes bounds from `ckd.cpp` for each table, and clamps extraneous VMR/T/P values to the table (but applies the proper number density of gas, so only broadening effects are mispresented, see `CKD::compute_ckd`)
  */
  Transmission compute_transmission(const CKD::Species &species, double T, double P, double vmr);

  /*
    Merges two transmission objects

    @param a The first Transmission object
    @param b The second Transmission object

    @return The merged Transmission object. Computes the transmission if `a` and `b` occur one after another

    @note Assumes the two Transmission object have no correlation (absorption lines are scattered randomly). Commutative by design, so `merge_transmission(a, b) == merge_transmission(b, a)` is guaranteed.
  */
  Transmission merge_transmission(Transmission a, Transmission b);

  /*
    Computes the energy error of an atmospheric configuration

    @param T vector of size `NUM_SLABS+1`, containing temperature of surface and slabs in Kelvin, starting from the slabs in increasing height and then the Earth's surface last
    @param co2 The VMR of carbon dioxide
    @param ch4 The VMR of methane

    @return A vector of size `NUM_SLABS+1` containing the error for each slab and surface, in the same order as passed to `T` (see above)
  */
  std::vector<double> compute_energy_error(std::vector<double> T, double co2, double ch4);

  // Fits inject_flux to AFGL baseline
  void fit_params();

  /*
   Resets the temperature to AFGL data.

   @param T The Eigen::VectorXd of size NUM_SLABS+1 containing temperature data.

   @return `void`

   @note Used to be `compute_atmosphere(0,0,T,true)` but that method will now error.
  */
  void reset_T(Eigen::VectorXd &T);

  /*
    Computes the equilibrium temperature of the atmosphere at a certain point

    @param co2 The VMR of carbon dioxide
    @param ch4 The VMR of methane
    @param T The initial starting state for the solver
    @param reset Used to determine if the function should reset T and return early. This function has been relocated to `reset_T` so setting this to `true` will now raise an exception
    @param tol The energy error tolerance after which the solver stops
    @param min_dt The minimum value of dt required for the solver to continue (detects when a minima is reached)
    @param verbose The verbosity of logging process. A negative or zero value disables this function and a positive value logs every `verbose` steps

    @note Fully thread-safe as it only reads the data objects (or uses mutex for I/O), *but* using two or more threads with the same `T` will cause race conditions as the solver directly modifies it.
    @note When precomputing it's advisable to do a sweep strategy and use the last solver state to pre-warm the new solver as opposed to re-seeding with AFGL data, especially if the scenario is far from baseline.
    */
  std::vector<double> compute_atmosphere(double co2, double ch4, Eigen::VectorXd &T, bool reset = false, double tol = 1e-7, double min_dt = 1e-12, int verbose = 50);

  // Initalizes the Greenhouse module, loads necessary data, and runs any initial precomputation needed
  void init();

  // Runs the precomputation of equilibrium profiles. Other simulations can skip this if not needed, or load the final binary file at `precompute_bin/final_result.bin`
  void compute();
}

#endif