#define _USE_MATH_DEFINES
#include <complex>
#include <string>
#include <vector>
#include <chrono>
#include <iostream>
#include <thread>
#include <fstream>
#include <cstring>
#include <cassert>
#include "config.h"
#include "ckd.h"
#include "Faddeeva.hh"

#define VOIGT_PROFILE_TEST_ACCURACY 0

namespace CKD
{
  Binning result_co2[15 * 18 * 11];
  Binning result_h2o[15 * 18 * 16];
  Binning result_o3[15 * 18 * 11];
  Binning result_ch4[15 * 18 * 11];
  Binning result_n2o[15 * 18 * 11];

  struct LineCompute
  {
    double nu;
    double S_T;
    double y;

    LineCompute(double nu, double S_T, double y) : nu(nu), S_T(S_T), y(y)
    {
    }
  };

  Species::Species(std::string gas_name, double molar_mass, Binning *result) : result(result)
  {
    molar_mass_g_mol = molar_mass;
    name = gas_name;

    {
      std::cout << "precompute_bin/" + gas_name + "_lines.bin" << std::endl;
      std::ifstream file("precompute_bin/" + gas_name + "_lines.bin", std::ios::binary);

      if (!file.is_open())
      {
        throw std::runtime_error("Spectroscopic data for " + gas_name + " cannot be opened!");
      }

      uint64_t num_lines = 0;
      file.read(reinterpret_cast<char *>(&num_lines), sizeof(num_lines));

      lines.resize(num_lines);
      file.read(reinterpret_cast<char *>(lines.data()), num_lines * sizeof(Line));
    }

    {
      std::ifstream file("precompute_bin/" + gas_name + "_Q.bin", std::ios::binary);

      if (!file.is_open())
      {
        throw std::runtime_error("Q-value data for " + gas_name + " cannot be opened!");
      }

      Q.resize(400);
      file.read(reinterpret_cast<char *>(Q.data()), 400 * sizeof(double));
    }
  }

  [[nodiscard]] double
  Species::molecular_mass_kg() const
  {
    return (molar_mass_g_mol / 1000.0) / PhysicsConstants::N_A;
  }

  double Species::Q_value(double T) const
  {
    int i1 = static_cast<int>(std::floor(T));
    int i2 = i1 + 1;
    if (i1 < 0)
      return Q.front();
    if (i2 >= 400)
      return Q.back();

    double frac = T - i1;
    return (Q[i2] - Q[i1]) * frac + Q[i1];
  }

  double approximate_faddeeva(std::complex<double> z)
  {
    // https://doi.org/10.3390/math10193451, equation 17b special case. Accuracy deteriorates at y <= 1e-6, so limit to y >= 1e-5 to be safe
    if ((std::pow(z.real() / 27, 2) + std::pow(z.imag() / 15, 2) >= 1) && (z.imag() >= 1e-5))
    {
      return -(std::complex<double>(1.0, 0) / (std::sqrt(M_PI) * (z - 0.5 / z))).imag();
    }
    return Faddeeva::w(z, 1e-3).real();
  }

#if VOIGT_PROFILE_TEST_ACCURACY == 1
  std::atomic<double> max_error(0);

  template <typename T>
  void update_max(std::atomic<T> &atomic_var, const T &new_value)
  {
    T current = atomic_var.load(std::memory_order_relaxed);

    // Only attempt an update if the incoming value is actually larger
    while (current < new_value &&
           !atomic_var.compare_exchange_weak(current, new_value,
                                             std::memory_order_relaxed,
                                             std::memory_order_relaxed))
    {
      // If compare_exchange_weak fails, 'current' is automatically
      // updated with the actual value currently stored in atomic_var.
    }
  }
#endif

  double faddeeva(std::complex<double> z)
  {
#if VOIGT_PROFILE_TEST_ACCURACY == -1
    return Faddeeva::w(z).real();
#elif VOIGT_PROFILE_TEST_ACCURACY == 0
    return approximate_faddeeva(z);
#elif VOIGT_PROFILE_TEST_ACCURACY == 1
    double approx = approximate_faddeeva(z);
    double ref = Faddeeva::w(z).real();
    double err = (approx - ref) / ref;
    if (ref > 1e-30)
      update_max(max_error, err);
    return approx;
#elif VOIGT_PROFILE_TEST_ACCURACY == 2
#else
#error "An invalid value for VOIGT_PROFILE_TEST_ACCURACY has been set. Valid values are -1, 0, 1, and 2"
#endif
  }

  Binning compute_ckd(const Species &species, double T, double P, double mixing_ratio)
  {
    const double INV_SQRT_PI = 1.0 / std::sqrt(M_PI);

    Binning result;

    std::vector<LineCompute> lines_large_y;  // y >= 15
    std::vector<LineCompute> lines_small_y;  // y <= 1e-5
    std::vector<LineCompute> lines_medium_y; // in between;
    double alpha_D_0 = std::sqrt(2 * PhysicsConstants::k_B * T / (species.molecular_mass_kg() * PhysicsConstants::c_sq));

    for (const auto &line : species.lines)
    {
      double nu = line.nu;

      double S_T = line.sw * (species.Q_value(296) / species.Q_value(T)) * exp(-PhysicsConstants::c2 * line.elower * (1 - T / 296) / T) * ((1 - exp(-PhysicsConstants::c2 * line.nu / T)) / (1 - exp(-PhysicsConstants::c2 * line.nu / 296)));
      S_T /= (std::sqrt(M_PI) * alpha_D_0 * line.nu);

      double y = (line.gamma_air * P * (1 - mixing_ratio) + line.gamma_self * P * mixing_ratio) * std::pow(296.0 / T, line.n_air); // gamma_L actually
      y /= (alpha_D_0 * line.nu);

      if (y >= 15)
      {
        lines_large_y.push_back({nu, S_T, y});
      }
      else if (y < 1e-5)
      {
        lines_small_y.push_back({nu, S_T, y});
      }
      else
      {
        lines_medium_y.push_back({nu, S_T, y});
      }
    }

    constexpr double LINES_WIDTH = 25;

    double start_nu = Config::NU_START;
    double LBL[Config::MAX_LBL_ENTRIES];

    int lines_small_y_start = 0;
    int lines_small_y_end = 0;
    int lines_medium_y_start = 0;
    int lines_medium_y_end = 0;
    int lines_large_y_start = 0;
    int lines_large_y_end = 0;

    for (int i = 0; i < Config::NUM_BINS; i++)
    {
      double width = Config::BIN_WIDTHS[i];
      memset(LBL, 0, sizeof LBL);
      int iters = std::round(width / Config::NU_STEP);
      assert(iters <= Config::MAX_LBL_ENTRIES);

      for (int idx = 0; idx < iters; idx++)
      {
        double nu = start_nu + Config::NU_STEP * idx;

        while (lines_small_y_end < lines_small_y.size() && lines_small_y[lines_small_y_end].nu <= (nu + LINES_WIDTH))
          lines_small_y_end++;
        while (lines_small_y_start < lines_small_y_end && lines_small_y[lines_small_y_start].nu <= (nu - LINES_WIDTH))
          lines_small_y_start++;

#pragma vector always
        for (int line = lines_small_y_start; line < lines_small_y_end; line++)
        {
          // u is x
          // a is y
          // H(a, u) approximated by T(a, u)
          double x = (nu - lines_small_y[line].nu) / (lines_small_y[line].nu * alpha_D_0);
          double y = lines_small_y[line].y;

          // Tepper Garcia approximation, tested with a < 1e-4
          // https://academic.oup.com/mnras/article/369/4/2025/1096494

          double P = x * x;
          double Q = 1.5 * P;
          double R = std::exp(-P);

          double V = (std::abs(x) > 1e-3)
                         ? (R - (y * INV_SQRT_PI / P) * (R * R * (4.0 * P * P + 7.0 * P + 4.0 + 1.5 * P) - 1.5 * P - 1.0))
                         : (1.0 - 2.0 * y * INV_SQRT_PI + P * (4.0 * y * INV_SQRT_PI - 1.0 + P * (0.5 - 5.0 * y * INV_SQRT_PI / (3.0))));

          LBL[idx] += V * lines_small_y[line].S_T;
        }

        while (lines_medium_y_end < lines_medium_y.size() && lines_medium_y[lines_medium_y_end].nu <= (nu + LINES_WIDTH))
          lines_medium_y_end++;
        while (lines_medium_y_start < lines_medium_y_end && lines_medium_y[lines_medium_y_start].nu <= (nu - LINES_WIDTH))
          lines_medium_y_start++;

        for (int line = lines_medium_y_start; line < lines_medium_y_end; line++)
        {
          double x = (nu - lines_medium_y[line].nu) / (lines_medium_y[line].nu * alpha_D_0);
          double y = lines_medium_y[line].y;

          double V = faddeeva(std::complex<double>(x, y));

          LBL[idx] += V * lines_medium_y[line].S_T;
        }

        while (lines_large_y_end < lines_large_y.size() && lines_large_y[lines_large_y_end].nu <= (nu + LINES_WIDTH))
          lines_large_y_end++;
        while (lines_large_y_start < lines_large_y_end && lines_large_y[lines_large_y_start].nu <= (nu - LINES_WIDTH))
          lines_large_y_start++;

#pragma vector always
        for (int line = lines_large_y_start; line < lines_large_y_end; line++)
        {
          double x = (nu - lines_large_y[line].nu) / (lines_large_y[line].nu * alpha_D_0);
          double y = lines_large_y[line].y;
          auto z = std::complex<double>(x, y);

          double V = -(std::complex<double>(1.0, 0) / (std::sqrt(M_PI) * (z - 0.5 / z))).imag();

          LBL[idx] += V * lines_large_y[line].S_T;
        }
      }

      // Generate CKD points

      std::sort(LBL, LBL + iters);
      for (int point = 0; point < Config::NUM_G_POINTS; point++)
      {
        result.bins[i].k[point] = LBL[std::clamp((int)std::round(Config::G_NODES[point] * iters), 0, iters - 1)];
      }

      start_nu += width;
    }

    std::cout << "A" << std::endl;
    return result;
  }

  struct Workload
  {
    const Species &species;
    double T, P, mixing_ratio;
    Binning result;
    int idx;

    Workload(const Species &species, double T, double P, double mixing_ratio, int idx = 0) : species(species), T(T), P(P), mixing_ratio(mixing_ratio), idx(idx) {}
  };

  std::atomic<int> compute_idx(0);
  std::atomic<int> completed(0);
  std::vector<Workload> tasks;

  void compute_thread()
  {
    while (true)
    {
      int task_id = compute_idx.fetch_add(1, std::memory_order_relaxed);
      if (task_id >= tasks.size())
        return;

      auto &task = tasks[task_id];
      task.result = compute_ckd(task.species, task.T, task.P, task.mixing_ratio);
      completed.fetch_add(1, std::memory_order_relaxed);
    }
  }

  void progress_watcher(std::stop_token stoken)
  {

    auto start = std::chrono::steady_clock::now();
    while (!stoken.stop_requested())
    {
      auto current = std::chrono::steady_clock::now();
      auto elapsed_s = std::chrono::duration_cast<std::chrono::milliseconds>(current - start).count() / 1000.0;
      std::cout << "Started: " << compute_idx
                << " Completed: " << completed
                << " Total: " << tasks.size()
                << " Elapsed: " << elapsed_s << " seconds "
                << "Time per task (approx): " << elapsed_s / (1.0 * completed) << " seconds "
#if VOIGT_PROFILE_TEST_ACCURACY == 1
                << "Maximum Relative Error: " << max_error
#endif
                << std::endl;
      std::this_thread::sleep_for(std::chrono::milliseconds(5000));
    }
  }

  void save_data(const std::string &filename, void *data, size_t size)
  {
    std::ofstream file(filename, std::ios::binary);
    if (!file.is_open())
    {
      throw std::runtime_error("Failed to open file for writing: " + filename);
    }

    file.write(reinterpret_cast<const char *>(data), size);
  }

  void run_tasks()
  {
    compute_idx = 0;
    completed = 0;
    auto start = std::chrono::steady_clock::now();
    int num_threads = std::thread::hardware_concurrency();
    std::vector<std::thread> threads;
    for (int i = 0; i < num_threads; i++)
    {
      threads.push_back(std::thread(compute_thread));
    }

    for (auto &thread : threads)
    {
      thread.join();
    }

    for (const auto &task : tasks)
    {
      if (task.species.name == "CO2")
      {
        assert((sizeof(result_co2) / sizeof(Binning)) > task.idx);
        result_co2[task.idx] = task.result;
      }
      else if (task.species.name == "N2O")
      {
        assert((sizeof(result_n2o) / sizeof(Binning)) > task.idx);
        result_n2o[task.idx] = task.result;
      }
      else if (task.species.name == "CH4")
      {
        assert((sizeof(result_ch4) / sizeof(Binning)) > task.idx);
        result_ch4[task.idx] = task.result;
      }
      else if (task.species.name == "H2O")
      {
        assert((sizeof(result_h2o) / sizeof(Binning)) > task.idx);
        result_h2o[task.idx] = task.result;
      }
      else if (task.species.name == "O3")
      {
        assert((sizeof(result_o3) / sizeof(Binning)) > task.idx);
        result_o3[task.idx] = task.result;
      }
    }
    tasks.clear();
  }

  void compute_ckd()
  {
    std::cout << "START";

    for (int T_idx = 0; T_idx < 15; T_idx++)
    {
      for (int P_idx = 0; P_idx < 18; P_idx++)
      {
        for (int vmr_idx = 0; vmr_idx < 11; vmr_idx++)
        {
          tasks.push_back({species_co2, 180 + 10 * T_idx, std::exp2(-P_idx), (4.2 + 0.42 * vmr_idx) * 1e-4, T_idx + 15 * (P_idx + 18 * vmr_idx)});
        }
      }
    }

    std::jthread watcher(progress_watcher);
    run_tasks();
    save_data("precompute_bin/CO2_transmission.bin", result_co2, sizeof result_co2);

    for (int T_idx = 0; T_idx < 15; T_idx++)
    {
      for (int P_idx = 0; P_idx < 18; P_idx++)
      {
        for (int vmr_idx = 0; vmr_idx < 16; vmr_idx++)
        {
          tasks.push_back({species_h2o, 180 + 10 * T_idx, std::exp2(-P_idx), 0.04 * std::exp2(-vmr_idx), T_idx + 15 * (P_idx + 18 * vmr_idx)});
        }
      }
    }

    run_tasks();
    save_data("precompute_bin/H2O_transmission.bin", result_h2o, sizeof result_h2o);

    for (int T_idx = 0; T_idx < 15; T_idx++)
    {
      for (int P_idx = 0; P_idx < 18; P_idx++)
      {
        for (int vmr_idx = 0; vmr_idx < 11; vmr_idx++)
        {
          tasks.push_back({species_o3, 180 + 10 * T_idx, std::exp2(-P_idx), 1e-5 * std::exp2(-vmr_idx), T_idx + 15 * (P_idx + 18 * vmr_idx)});
        }
      }
    }

    run_tasks();
    save_data("precompute_bin/O3_transmission.bin", result_o3, sizeof result_o3);

    for (int T_idx = 0; T_idx < 15; T_idx++)
    {
      for (int P_idx = 0; P_idx < 18; P_idx++)
      {
        for (int vmr_idx = 0; vmr_idx < 11; vmr_idx++)
        {
          tasks.push_back({species_ch4, 180 + 10 * T_idx, std::exp2(-P_idx), 1e-6 * (1 + 0.3 * vmr_idx), T_idx + 15 * (P_idx + 18 * vmr_idx)});
        }
      }
    }

    run_tasks();
    save_data("precompute_bin/CH4_transmission.bin", result_ch4, sizeof result_ch4);

    for (int T_idx = 0; T_idx < 15; T_idx++)
    {
      for (int P_idx = 0; P_idx < 18; P_idx++)
      {
        for (int vmr_idx = 0; vmr_idx < 11; vmr_idx++)
        {
          tasks.push_back({species_n2o, 180 + 10 * T_idx, std::exp2(-P_idx), 1e-7 * (1 + 0.4 * vmr_idx), T_idx + 15 * (P_idx + 18 * vmr_idx)});
        }
      }
    }

    run_tasks();
    save_data("precompute_bin/N2O_transmission.bin", result_n2o, sizeof result_n2o);

    watcher.request_stop();
    watcher.join();
  }

} // namespace CKD
