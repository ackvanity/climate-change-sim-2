#ifndef CKD_H
#define CKD_H 1

#include <complex>
#include <string>
#include <vector>
#include "config.h"

namespace CKD
{
  // Contains the properties of a HITRAN absorption line, including broadening parameters
  struct Line
  {
    double nu, sw, gamma_air, gamma_self, elower, n_air;
  };

  // A Correlated-k-Distribution result over a single bin. Configure points in "config.h"
  struct CKD
  {
    double k[Config::NUM_G_POINTS];
  };

  // A collection of CKD results spanning every bin in the simulation. Configure bins in "config.h"
  struct Binning
  {
    CKD bins[Config::NUM_BINS];
  };

  // A species/compound of gas present in the atmosphere (e.g. O3, CO2, CH4, etc.)
  struct Species
  {
    std::string name;        // An identifiable name of the gas, used to determine file names
    double molar_mass_g_mol; // Molar mass in g/mol
    std::vector<Line> lines; // Line-by-line data from HITRAN
    std::vector<double> Q;   // Partition function, alos loaded from HITRAN
    Binning *result;         // A pointer to the array holding the precomputation table for CKD distributions

    /*
      Instantiates a species

      @param gas_name The name of the gas. This class will work in the `precompute_bin` directory, load `{gas_name}_lines.bin` for HITRAN line data and `{gas_name}_Q.bin` for partition functions, and write to `{gas_name}_transmission.bin` for the final CKD table, with `{gas_name}` substituted by the gas name passed.
      @param molar_mass The molar mass of the gas in g/mol. Neither binary files store this, so it needs to be given separately
      @param result A pointer to the array holding all binning results
    */
    Species(std::string gas_name, double molar_mass, Binning *result);

    /*
      Calculates the molar mass per gram

      @returns `molar_mass_g_mol` divided by 1000
    */
    [[nodiscard]] double
    molecular_mass_kg() const;

    /*
      Calculates the partition function of the gas

      @param T temperature of the gas
      @returns The value of the partition function `Q(T)`
    */
    double Q_value(double T) const;
  };

  // Approximates the Faddeeva function
  // @param z The complex input z
  double faddeeva(std::complex<double> z);

  // Results arrays
  extern Binning result_co2[15 * 18 * 11];
  extern Binning result_h2o[15 * 18 * 16];
  extern Binning result_o3[15 * 18 * 11];
  extern Binning result_ch4[15 * 18 * 11];
  extern Binning result_n2o[15 * 18 * 11];

  // Species data
  const Species species_co2("CO2", 44.01, result_co2);
  const Species species_h2o("H2O", 18.015, result_h2o);
  const Species species_o3("O3", 47.997, result_o3);
  const Species species_ch4("CH4", 16.04, result_ch4);
  const Species species_n2o("N2O", 44.013, result_n2o);

  /*
    Computes the CKD distribution at a certain atmospheric state

    @param species The Species object of the gas to compute the distribution
    @param T The temperature of the atmosphere at that point in Kelvin
    @param P The pressure of the atmosphere at that point in atm
    @param mixing_ratio The volume mixing ratio (vmr) of the gas inside the atmosphere
    @returns A Binning object containing the CKD distribution
    @note This function returns the cross-section data for one molecule (in cm^2), accounting for broadening. It does *not* multiply that value by thickness or number density of the gas. This means that:
    @note   1. The result must be converted into a proper absorption coefficient by multiplying it by the number density of the gas and the slab thickness
    @note   2. For cases where the self-broadening is relatively negligible/constant, it is feasible to run the compute once at a set mixing ratio, and then use the result at a different mixing ratio by altering the number density of the gas
  */
  Binning compute_ckd(const Species &species, double T, double P, double mixing_ratio = 0);

  // Calculates CKD data for all gases
  void compute_ckd();

} // namespace CKD

#endif