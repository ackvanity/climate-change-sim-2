#include <bits/stdc++.h>
#include "greenhouse.cpp"
#include "Faddeeva.hh"
#include "config.h"
#include <chrono>

namespace Greenhouse
{
  constexpr int NUM_PLANCK_POINTS = 50;
  constexpr int PLANCK_POINTS_START = 150;

  double planck[NUM_PLANCK_POINTS][Config::NUM_BINS]; // [T_idx][bins] where T = T_idx + PLANCK_POINTS_START

  void compute_planck()
  {
    for (int T_idx = 0; T_idx < NUM_PLANCK_POINTS; T_idx++)
    {
      double T = T_idx + PLANCK_POINTS_START;
      double nu = Config::NU_START;
      for (int bin_idx = 0; bin_idx < Config::NUM_BINS; bin_idx++)
      {
        double nu_start = nu;
        double nu_end = nu + Config::BIN_WIDTHS[bin_idx];
        double integral = 0;
        for (int g_idx = 0; g_idx < Config::NUM_G_POINTS; g_idx++) // Reuse Gaussian quadrature data from CKD
        {
          double f = (nu_start + (nu_end - nu_start) * Config::G_NODES[g_idx]) * PhysicsConstants::c * 100; // interpolate and convert from cm-1 to Hz
          integral += Config::G_WEIGHTS[g_idx] * 2 * PhysicsConstants::h * pow(f, 3) / (pow(PhysicsConstants::c, 2) * (std::exp(PhysicsConstants::h * f / (PhysicsConstants::k_B * T)) - 1));
          // integral += Config::G_WEIGHTS[g_idx] * 2;
        }
        integral *= (nu_end - nu_start) * PhysicsConstants::c * 100; // cm-1 to Hz

        nu = nu_end;
        planck[T_idx][bin_idx] = integral;
        std::cout << integral << " ";
      }
      std::cout << std::endl;
    }
  }
}

int main()
{
  compute_ckd();
  Greenhouse::compute_planck();
}