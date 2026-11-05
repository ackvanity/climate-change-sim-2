#define _USE_MATH_DEFINES
#include <complex>
#include <string>
#include <vector>
#include <chrono>
#include <iostream>
#include <thread>
#include <fstream>
#include <cstring>
#include "Faddeeva.hh"
#include "Eigen/Dense"
#include "ckd.h"
#include "greenhouse.h"
#include "config.h"
#include <chrono>

namespace Greenhouse
{
  // Precomputed planck tables
  double planck[NUM_PLANCK_POINTS][Config::NUM_BINS]; // [T_idx][bins] where T = T_idx + PLANCK_POINTS_START
  double S0[Config::NUM_BINS];                        // Solar input (in addition to injected flux)

  // Constants about the atmosphere, assumed to be invariant with warming
  std::vector<std::vector<double>> afgl; // AFGL standard data, interpolated
  std::vector<double> vmr_o3;            // VMR of ozone, from AFGL
  std::vector<double> vmr_n2o;           // VMR of nitrous oxide, from AFGL
  std::vector<double> rh_h2o;            // Relative humidity of water, from AFGL
  std::vector<double> inject_flux;       // Injected flux at each layer. The main simulation does this to match AFGL data at baseline, but the `urban` simulation alters this to simulate different times of day

  double compute_water_saturation(double T)
  {
    T -= 273.15; // conver to Celsius
    if (T >= 0.0)
    {
      return (610.78 / PhysicsConstants::atm) * std::exp(17.27 * T / (T + 237.3));
    }
    else
    {
      return (610.78 / PhysicsConstants::atm) * std::exp(21.875 * T / (T + 265.5));
    }
  }

  void compute_afgl()
  {
    std::vector<std::vector<double>> afgl_raw; // Raw AFGL data

    std::ifstream file("afgl-1986/1f.csv");

    if (!file.is_open())
    {
      throw std::runtime_error("Cannot open AFGL table!");
    }

    std::string line;
    std::getline(file, line);

    while (std::getline(file, line))
    {
      std::stringstream ss(line);
      double tmp;
      afgl_raw.push_back({});
      while (ss >> tmp)
      {
        char c;
        ss >> c; // for the semicolon
        afgl_raw.back().push_back(tmp);
        // std::cout << tmp << " ";
      }
      // std::cout << std::endl;
    }

    int idx = 0;
    for (int z = 0; z <= 120; z++)
    {
      while ((idx + 1) < afgl_raw.size() && afgl_raw[idx + 1][0] <= z)
      {
        idx++;
      }
      if (idx == (afgl_raw.size() - 1))
      {
        afgl.push_back(afgl_raw[idx]);
      }
      else
      {
        afgl.push_back({});
        double ratio = ((double)z - afgl_raw[idx][0]) / (afgl_raw[idx + 1][0] - afgl_raw[idx][0]);
        for (int i = 0; i < afgl_raw[idx].size(); i++)
        {
          afgl.back().push_back(std::lerp(afgl_raw[idx][i], afgl_raw[idx + 1][i], ratio));
        }
      }
      vmr_o3.push_back(afgl.back()[5] * 1e-6);
      vmr_n2o.push_back(afgl.back()[6] * 1e-6);
      rh_h2o.push_back((afgl.back()[4] * 1e-6) * afgl.back()[1] * (100 / PhysicsConstants::atm) / compute_water_saturation(afgl.back()[2]));
      // std::cout << std::setw(15) << std::scientific << std::setprecision(4) << vmr_o3.back() << "\t" << std::setw(15) << std::scientific << std::setprecision(4) << vmr_n2o.back() << "\t" << std::setw(15) << std::scientific << std::setprecision(4) << rh_h2o.back() << "\t" << std::setw(15) << std::scientific << std::setprecision(4) << compute_water_saturation(afgl.back()[2]) << std::endl;
    }
  }

  void compute_planck()
  {
    for (int T_idx = 0; T_idx < NUM_PLANCK_POINTS; T_idx++)
    {
      double T = T_idx * PLANCK_POINTS_STEP + PLANCK_POINTS_START;
      double nu = Config::NU_START;
      for (int bin_idx = 0; bin_idx < Config::NUM_BINS; bin_idx++)
      {
        double nu_start = nu;
        double nu_end = nu + Config::BIN_WIDTHS[bin_idx];
        double integral = 0;
        for (int g_idx = 0; g_idx < Config::NUM_G_POINTS; g_idx++) // Reuse Gaussian quadrature data from CKD
        {
          double f = (nu_start + (nu_end - nu_start) * Config::G_NODES[g_idx]) * PhysicsConstants::c * 100; // interpolate and convert from cm-1 to Hz
          integral += M_PI * Config::G_WEIGHTS[g_idx] * 2 * PhysicsConstants::h * pow(f, 3) / (pow(PhysicsConstants::c, 2) * (std::exp(PhysicsConstants::h * f / (PhysicsConstants::k_B * T)) - 1));
          // integral += Config::G_WEIGHTS[g_idx] * 2;
        }
        integral *= (nu_end - nu_start) * PhysicsConstants::c * 100; // cm-1 to Hz

        nu = nu_end;
        planck[T_idx][bin_idx] = integral;
        // std::cout << integral << " ";
      }
      // std::cout << std::endl;
    }

    double T = 5778;
    double nu = Config::NU_START;
    for (int bin_idx = 0; bin_idx < Config::NUM_BINS; bin_idx++)
    {
      double nu_start = nu;
      double nu_end = nu + Config::BIN_WIDTHS[bin_idx];
      double integral = 0;
      for (int g_idx = 0; g_idx < Config::NUM_G_POINTS; g_idx++) // Reuse Gaussian quadrature data from CKD
      {
        double f = (nu_start + (nu_end - nu_start) * Config::G_NODES[g_idx]) * PhysicsConstants::c * 100; // interpolate and convert from cm-1 to Hz
        integral += M_PI * Config::G_WEIGHTS[g_idx] * 2 * PhysicsConstants::h * pow(f, 3) / (pow(PhysicsConstants::c, 2) * (std::exp(PhysicsConstants::h * f / (PhysicsConstants::k_B * T)) - 1));
        // integral += Config::G_WEIGHTS[g_idx] * 2;
      }
      integral *= (nu_end - nu_start) * PhysicsConstants::c * 100; // cm-1 to Hz

      nu = nu_end;
      S0[bin_idx] = integral / (PhysicsConstants::sigma * T * T * T * T) * 1361 / 4;
    }
    // std::cout << std::endl;
  }

  Transmission compute_transmission(const CKD::Species &species, double T, double P, double vmr)
  {
    double T_idx = T / 10.0 - 18;
    int T_idx_0 = std::clamp((static_cast<int>(T_idx)), 0, 14);
    int T_idx_1 = std::clamp(T_idx_0 + 1, 0, 14);

    double logP_idx = -std::log2(P);
    int logP_idx_0 = std::clamp((static_cast<int>(logP_idx)), 0, 17);
    int logP_idx_1 = std::clamp(logP_idx_0 + 1, 0, 17);

    Transmission result;
    for (auto &t : result.T)
    {
      std::fill(std::begin(t), std::end(t), 1.0);
    }

    double vmr_idx;
    int vmr_idx_0;
    int vmr_idx_1;

    if (species.name == "CO2")
    {
      vmr_idx = (vmr * 1e4 - 4.2) / 0.42;
      vmr_idx_0 = std::clamp((static_cast<int>(vmr_idx)), 0, 10);
      vmr_idx_1 = std::clamp(vmr_idx_0 + 1, 0, 10);
    }

    if (species.name == "H2O")
    {
      vmr_idx = -std::log2(vmr / 0.04);
      vmr_idx_0 = std::clamp((static_cast<int>(vmr_idx)), 0, 15);
      vmr_idx_1 = std::clamp(vmr_idx_0 + 1, 0, 15);
    }
    if (species.name == "O3")
    {
      vmr_idx = -std::log2(vmr / 1e-5);
      vmr_idx_0 = std::clamp((static_cast<int>(vmr_idx)), 0, 10);
      vmr_idx_1 = std::clamp(vmr_idx_0 + 1, 0, 10);
    }

    if (species.name == "CH4")
    {
      vmr_idx = (vmr / 1e-6 - 1) / 0.3;
      vmr_idx_0 = std::clamp((static_cast<int>(vmr_idx)), 0, 10);
      vmr_idx_1 = std::clamp(vmr_idx_0 + 1, 0, 10);
    }

    if (species.name == "N2O")
    {
      vmr_idx = (vmr / 1e-7 - 1) / 0.4;

      vmr_idx_0 = std::clamp((static_cast<int>(vmr_idx)), 0, 10);
      vmr_idx_1 = std::clamp(vmr_idx_0 + 1, 0, 10);
    }

    memset(result.T, 0, sizeof result.T);
#define IDX(T, P, vmr) (T + 15 * (P + 18 * vmr))
    for (int bin = 0; bin < Config::NUM_BINS; bin++)
    {
      for (int point = 0; point < Config::NUM_G_POINTS; point++)
      {
        double c00 = std::lerp(species.result[IDX(T_idx_0, logP_idx_0, vmr_idx_0)].bins[bin].k[point], species.result[IDX(T_idx_0, logP_idx_0, vmr_idx_1)].bins[bin].k[point], std::clamp(vmr_idx - vmr_idx_0, 0.0, 1.0));
        double c01 = std::lerp(species.result[IDX(T_idx_0, logP_idx_1, vmr_idx_0)].bins[bin].k[point], species.result[IDX(T_idx_0, logP_idx_1, vmr_idx_1)].bins[bin].k[point], std::clamp(vmr_idx - vmr_idx_0, 0.0, 1.0));
        double c10 = std::lerp(species.result[IDX(T_idx_1, logP_idx_0, vmr_idx_0)].bins[bin].k[point], species.result[IDX(T_idx_1, logP_idx_0, vmr_idx_1)].bins[bin].k[point], std::clamp(vmr_idx - vmr_idx_0, 0.0, 1.0));
        double c11 = std::lerp(species.result[IDX(T_idx_1, logP_idx_1, vmr_idx_0)].bins[bin].k[point], species.result[IDX(T_idx_1, logP_idx_1, vmr_idx_1)].bins[bin].k[point], std::clamp(vmr_idx - vmr_idx_0, 0.0, 1.0));

        double c0 = std::lerp(c00, c01, std::clamp(logP_idx - logP_idx_0, 0.0, 1.0));
        double c1 = std::lerp(c10, c11, std::clamp(logP_idx - logP_idx_0, 0.0, 1.0));

        double c = std::lerp(c0, c1, std::clamp(T_idx - T_idx_0, 0.0, 1.0));

        result.T[bin][point] = std::exp(-1.66 * c * vmr * (PhysicsConstants::N_A * (P * PhysicsConstants::atm) / (PhysicsConstants::R * T * 1e6)) * h * 100);
      }
    }
    return result;
#undef IDX
  }

  Transmission merge_transmission(Transmission a, Transmission b)
  {
    Transmission c;
    for (int bin = 0; bin < Config::NUM_BINS; bin++)
    {
      std::pair<double, double> arr[Config::NUM_G_POINTS * Config::NUM_G_POINTS];
      for (int a_idx = 0; a_idx < Config::NUM_G_POINTS; a_idx++)
      {
        for (int b_idx = 0; b_idx < Config::NUM_G_POINTS; b_idx++)
        {
          arr[a_idx * 16 + b_idx] = {a.T[bin][a_idx] * b.T[bin][b_idx], Config::G_WEIGHTS[a_idx] * Config::G_WEIGHTS[b_idx]};
        }
      }
      std::sort(std::begin(arr), std::end(arr));
      int ab_idx = 0;
      for (int c_idx = 0; c_idx < Config::NUM_G_POINTS; c_idx++)
      {
        double target = Config::G_WEIGHTS[c_idx];
        c.T[bin][c_idx] = 0;
        while (target > 1e-15 && ab_idx < 256)
        {
          double take = std::min(target, arr[ab_idx].second);
          c.T[bin][c_idx] += take * arr[ab_idx].first;
          target -= take;
          arr[ab_idx].second -= take;
          if (arr[ab_idx].second <= 1e-15)
            ab_idx++;
        }
        c.T[bin][c_idx] /= Config::G_WEIGHTS[c_idx];
      }
    }
    return c;
  }

  // convention: Earth's temperature dead last, lowest height first
  std::vector<double> compute_energy_error(std::vector<double> T, double co2, double ch4)
  {
    const double T_E = T.back();
    const double albedo = 0.3;
    T.pop_back();
    constexpr double mr_air = 28.96e-3; // The mr of the air, assumed to be constant, measured in KILOgrams (not grams) per mole.

    std::vector<double> P; // in atm
    P.push_back(1);        // Hard-code 1 atm at surface

    double y = h / 2.0; // assume height at center

    for (auto t : T)
    {
      P.push_back(P.back() * std::exp(-mr_air * h * PhysicsConstants::g / (PhysicsConstants::R * t)));
      y += h;
    }
    P.pop_back();

    // Code a subroutine to get transmission coefficients from before.
    // Calculate energy fluxes going into and out of each gas
    // Penalize error
    // Lapse rates (so find the net flux on EACH BOUNDARY
    std::vector<double> fluxes; // going from layer i down to i-1 is positive, else negative
    fluxes.resize(T.size() + 1);
    double transfer[Config::NUM_BINS][Config::NUM_G_POINTS];
    for (int bin = 0; bin < Config::NUM_BINS; bin++)
    {
      for (int point = 0; point < Config::NUM_G_POINTS; point++)
      {
        transfer[bin][point] = S0[bin];
      }
    }

    for (int i = (T.size() - 1); i >= 0; i--)
    {
      Transmission transmission;
      for (auto &t : transmission.T)
      {
        std::fill(std::begin(t), std::end(t), 1.0);
      }
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_ch4, T[i], P[i], ch4));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_co2, T[i], P[i], co2));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_o3, T[i], P[i], vmr_o3[i]));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_n2o, T[i], P[i], vmr_n2o[i]));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_h2o, T[i], P[i], rh_h2o[i] * compute_water_saturation(T[i]) / P[i]));

      auto idx1 = std::clamp<int>((T[i] - PLANCK_POINTS_START) / PLANCK_POINTS_STEP, 0, NUM_PLANCK_POINTS - 1);
      auto idx2 = std::clamp<int>((T[i] - PLANCK_POINTS_START) / PLANCK_POINTS_STEP + 1, 0, NUM_PLANCK_POINTS - 1);
      auto w = (T[i] - PLANCK_POINTS_START) / PLANCK_POINTS_STEP - idx1;
      for (int bin = 0; bin < Config::NUM_BINS; bin++)
      {
        for (int point = 0; point < Config::NUM_G_POINTS; point++)
        {
          fluxes[i + 1] += transfer[bin][point] * Config::G_WEIGHTS[point];
        }
      }
      for (int bin = 0; bin < Config::NUM_BINS; bin++)
      {
        for (int point = 0; point < Config::NUM_G_POINTS; point++)
        {
          transfer[bin][point] *= transmission.T[bin][point];
          transfer[bin][point] += (1 - transmission.T[bin][point]) * (planck[idx1][bin] + (planck[idx2][bin] - planck[idx1][bin]) * w);
        }
      }
    }

    auto idx_E1 = std::clamp<int>((T_E - PLANCK_POINTS_START) / PLANCK_POINTS_STEP, 0, NUM_PLANCK_POINTS - 1);
    auto idx_E2 = std::clamp<int>((T_E - PLANCK_POINTS_START) / PLANCK_POINTS_STEP + 1, 0, NUM_PLANCK_POINTS - 1);
    auto w = ((T_E - PLANCK_POINTS_START) / PLANCK_POINTS_STEP) - idx_E1;

    for (int bin = 0; bin < Config::NUM_BINS; bin++)
    {
      for (int point = 0; point < Config::NUM_G_POINTS; point++)
      {
        fluxes[0] += transfer[bin][point] * Config::G_WEIGHTS[point];
      }
    }
    for (int bin = 0; bin < Config::NUM_BINS; bin++)
    {
      for (int point = 0; point < Config::NUM_G_POINTS; point++)
      {
        transfer[bin][point] *= (bin >= 13 ? albedo : 0);
        transfer[bin][point] += (planck[idx_E1][bin] + (planck[idx_E2][bin] - planck[idx_E1][bin]) * w) * (1 - (bin >= 13 ? albedo : 0));
      }
    }

    for (int i = 0; i < T.size(); i++)
    {
      Transmission transmission;
      for (auto &t : transmission.T)
      {
        std::fill(std::begin(t), std::end(t), 1.0);
      }
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_ch4, T[i], P[i], ch4));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_co2, T[i], P[i], co2));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_o3, T[i], P[i], vmr_o3[i]));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_n2o, T[i], P[i], vmr_n2o[i]));
      transmission = merge_transmission(transmission, compute_transmission(CKD::species_h2o, T[i], P[i], rh_h2o[i] * compute_water_saturation(T[i]) / P[i]));

      auto idx1 = std::clamp<int>((T[i] - PLANCK_POINTS_START) / PLANCK_POINTS_STEP, 0, NUM_PLANCK_POINTS - 1);
      auto idx2 = std::clamp<int>((T[i] - PLANCK_POINTS_START) / PLANCK_POINTS_STEP + 1, 0, NUM_PLANCK_POINTS - 1);
      auto w = (T[i] - PLANCK_POINTS_START) / PLANCK_POINTS_STEP - idx1;
      for (int bin = 0; bin < Config::NUM_BINS; bin++)
      {
        for (int point = 0; point < Config::NUM_G_POINTS; point++)
        {
          fluxes[i] -= transfer[bin][point] * Config::G_WEIGHTS[point];
        }
      }
      for (int bin = 0; bin < Config::NUM_BINS; bin++)
      {
        for (int point = 0; point < Config::NUM_G_POINTS; point++)
        {
          transfer[bin][point] *= transmission.T[bin][point];
          transfer[bin][point] += (1 - transmission.T[bin][point]) * (planck[idx1][bin] + (planck[idx2][bin] - planck[idx1][bin]) * w);
        }
      }
    }

    for (int bin = 0; bin < Config::NUM_BINS; bin++)
    {
      for (int point = 0; point < Config::NUM_G_POINTS; point++)
      {
        fluxes[T.size()] -= transfer[bin][point] * Config::G_WEIGHTS[point];
      }
    }
    // for (int idx = fluxes.size() - 1; idx >= 0; idx--)
    // {
    //   std::cout << idx << " " << fluxes[idx] << std::endl;
    // }
    // std::cout << "TRANS\n";
    // std::vector<double> energy;
    for (int idx = fluxes.size() - 1; idx > 0; idx--)
    {
      fluxes[idx] -= fluxes[idx - 1];
      // std::cout << idx << " " << fluxes[idx] << std::endl;
    }
    T.insert(T.begin(), T_E);
    for (int idx = 0; idx <= (fluxes.size() - 2); idx++)
    {

      double delta = (T[idx] - T[idx + 1] - 6.5);
      const double w = 0.3;
      double F = 300 * ((delta < 0) ? 0 : ((delta > w) ? (delta - w * 0.5) : (delta * delta / (w * 2))));

      if (F > 0)
        fluxes[idx + 1] += F, fluxes[idx] -= F;
    }
    for (int idx = 0; idx < std::min(fluxes.size(), inject_flux.size()); idx++)
      fluxes[idx] += inject_flux[idx];
    return fluxes;
  }

  void load_data(std::string fname, void *ptr, int size)
  {
    std::ifstream file(fname);
    if (!file.is_open())
      throw std::runtime_error("Cannot read file " + fname);

    file.read(reinterpret_cast<char *>(ptr), size);
  }

  void fit_params()
  {
    std::vector<double> T(n);

    for (int i = 0; i < (n - 1); i++)
      T[i] = afgl[i + 1][2];
    T[n - 1] = afgl[0][2];

    inject_flux = compute_energy_error(T, 330e-6, 1.93e-6);

    for (auto &f : inject_flux)
      f *= -1;
  }

  std::mutex stdout_mutex;

  void reset_T(Eigen::VectorXd &T)
  {
    for (int i = 0; i < (n - 1); i++)
      T[i] = afgl[i + 1][2];
    T[n - 1] = afgl[0][2];
  }

  std::vector<double> compute_atmosphere(double co2, double ch4, Eigen::VectorXd &T, bool reset, double tol, double min_dt, int verbose)
  {
    constexpr double T_MIN = 160;
    constexpr double T_MAX = 440;  // keep inside the Planck table (150 K to 450 K)
    constexpr double MAX_STEP = 3; // largest allowed change of one temperature per iteration, in K

    Eigen::VectorXd C(n);
    for (int i = 0; i < (n - 1); i++)
    {
      C[i] = 1 / (afgl[i + 1][1] / afgl[i + 1][2]);
    }

    C[n - 1] = 1 / (afgl[0][1] / afgl[0][2]);

    auto residual = [&](const Eigen::VectorXd &x)
    {
      std::vector<double> T(x.data(), x.data() + x.size());
      std::vector<double> E = compute_energy_error(T, co2, ch4);
      E.push_back(E[0]);
      E.erase(E.begin());
      return Eigen::VectorXd(Eigen::Map<Eigen::VectorXd>(E.data(), E.size()));
    };

    if (reset)
    {
      throw "Reset T using reset_T. The compute_atmosphere function will no longer handle this task!";
    }

    Eigen::VectorXd E = residual(T);
    double mag = E.squaredNorm();
    double dt = 1e5;

    bool stopped_because_of_reps = true;

    for (int reps = 0; reps < 50000; reps++)
    {
      Eigen::VectorXd delta = E.cwiseProduct(C) * dt;

      if (mag < tol || dt < min_dt)
      {
        stopped_because_of_reps = false;
        break;
      }

      Eigen::VectorXd T_new = T;
      for (int i = 0; i < n; i++)
      {
        T_new[i] = std::clamp(T[i] + std::clamp(delta[i], -MAX_STEP, MAX_STEP), T_MIN, T_MAX);
      }

      Eigen::VectorXd E_new = residual(T_new);
      double mag_new = E_new.squaredNorm();

      if (mag_new < mag || E_new.dot(E_new.cwiseProduct(C)) < E.dot(E.cwiseProduct(C)))
      {
        T = T_new;
        E = E_new;
        mag = mag_new;
        dt = std::min(dt * 2, 1e12);
      }
      else
      {
        dt /= 4;
      }
      if (verbose > 0)
        if ((reps % verbose) == 0)
        {
          std::lock_guard<std::mutex> lock(stdout_mutex);
          std::cerr << "REPETITION " << reps << " / 50000 | " << mag << std::endl;
        }
    }

    if (stopped_because_of_reps || (mag > tol))
    {
      std::lock_guard<std::mutex> lock(stdout_mutex);
      std::cerr << "WARNING: iteration stopped prematurely.\n"
                << "CO2 VMR: " << co2 << "CH4 VMR: " << ch4 << "Energy error: " << mag << "dt: " << dt << std::endl;
    }

    std::vector<double> answer(T.data(), T.data() + T.size());
    return answer;
  }

  double result[7 * 21 * 81];

  void compute_stride(int ch4_idx)
  {
    constexpr int n = 81;
    Eigen::VectorXd T(n);
    reset_T(T);

    double ch4 = 1.0 + 0.5 * ch4_idx;
    for (int co2_idx = 0; co2_idx < 21; co2_idx++)
    {
      int idx = (co2_idx + 21 * ch4_idx);
      double co2 = 420 + 19 * co2_idx;
      std::vector<double> tmp = compute_atmosphere(co2 * 1e-6, ch4 * 1e-6, T, false);
      memcpy(result + (idx * 81), tmp.data(), (sizeof(double)) * tmp.size());
      {
        std::lock_guard<std::mutex> lock(stdout_mutex);
        std::cout << ch4_idx << " / " << co2_idx << "[" << idx << "]" << std::endl;
      }
    }
  }

  void init()
  {
    load_data("precompute_bin/CH4_transmission.bin", CKD::result_ch4, sizeof CKD::result_ch4);
    load_data("precompute_bin/H2O_transmission.bin", CKD::result_h2o, sizeof CKD::result_h2o);
    load_data("precompute_bin/O3_transmission.bin", CKD::result_o3, sizeof CKD::result_o3);
    load_data("precompute_bin/N2O_transmission.bin", CKD::result_n2o, sizeof CKD::result_n2o);
    load_data("precompute_bin/CO2_transmission.bin", CKD::result_co2, sizeof CKD::result_co2);

    compute_planck();
    compute_afgl();
    fit_params();
  }

  void compute()
  {
    std::vector<std::thread> threads;

    for (int ch4_idx = 0; ch4_idx < 7; ch4_idx++)
    {
      threads.push_back(std::thread(compute_stride, ch4_idx));
    }

    for (auto &thread : threads)
    {
      thread.join();
    }

    std::ofstream output("precompute_bin/final_result.bin");
    output.write(reinterpret_cast<char *>(result), sizeof result);
  }
}