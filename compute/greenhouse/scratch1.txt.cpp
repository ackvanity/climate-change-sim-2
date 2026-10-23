#include <bits/stdc++.h>
#include <config.h>
#include <Faddeeva.hh>
#include <chrono>

// Set to 1 to evaluate the Faddeeva function to machine precision and compare the relative error of the approximated profile and the reference profile, and logs maximum
// Set to 2 to compute the relative error and create a frequency distribution of errors
// Set to -1 to force using the Faddeeva function to machine precision
#define VOIGT_PROFILE_TEST_ACCURACY 0

struct Line
{
  double nu, sw, gamma_air, gamma_self, elower, n_air;
};

struct LineCompute
{
  double alpha_D;
  double gamma_L;
  double nu;
  double S_T;
};

struct CKD
{
  double k[Config::NUM_G_POINTS];
};

struct Binning
{
  CKD bins[Config::NUM_BINS];
};

struct Species
{
  std::string name;
  double molar_mass_g_mol;
  std::vector<Line> lines;
  std::vector<double> Q;

  Species(std::string gas_name, double molar_mass)
  {
    molar_mass_g_mol = molar_mass;
    name = gas_name;

    {
      std::ifstream file(gas_name + "_lines.bin", std::ios::binary);

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
      std::ifstream file(gas_name + "_Q.bin", std::ios::binary);

      if (!file.is_open())
      {
        throw std::runtime_error("Q-value data for " + gas_name + " cannot be opened!");
      }

      Q.resize(400);
      file.read(reinterpret_cast<char *>(Q.data()), 400 * sizeof(double));
    }
  }

  [[nodiscard]] double molecular_mass_kg() const
  {
    return (molar_mass_g_mol / 1000.0) / PhysicsConstants::N_A;
  }

  double Q_value(double T) const
  {
    int i1 = T - 1;
    int i2 = T;
    if (i1 < 0)
      return Q.front();
    if (i2 >= 400)
      return Q.back();

    double frac = T - i2;
    return (Q[i2] - Q[i1]) * frac + Q[i1];
  }
};

double approximate_faddeeva(std::complex<double> z)
{
  // https://doi.org/10.3390/math10193451, equation 17b special case. Accuracy deteriorates at y <= 1e-6, so limit to y >= 1e-5 to be safe
  if ((std::pow(z.real() / 27, 2) + std::pow(z.imag() / 15, 2) >= 1) && (z.imag() >= 1e-5))
  {
    return -(std::complex<double>(1.0, 0) / (std::sqrt(M_PI) * (z - 0.5 / z))).imag();
  }
  return Faddeeva::w(z, 1e-3).real();
}

double faddeeva(std::complex<double> z)
{
#if VOIGT_PROFILE_TEST_ACCURACY == -1
  return Faddeeva : w(z);
#elif VOIGT_PROFILE_TEST_ACCURACY == 0
  return approximate_faddeeva(z);
#elif VOIGT_PROFILE_TEST_ACCURACY == 1
  double approx = approximate_faddeeva(z);
  double ref = Faddeeva : w(z);
  double err = (approx - ref) / ref;
#elif VOIGT_PROFILE_TEST_ACCURACY == 2
#else
#error "An invalid value for VOIGT_PROFILE_TEST_ACCURACY has been set. Valid values are -1, 0, 1, and 2"
#endif
}

Binning compute_ckd(const Species &species, double T, double P, double mixing_ratio = 0)
{
  Binning result;

  std::vector<LineCompute> lines;
  double alpha_D_0 = std::sqrt(2 * PhysicsConstants::k_B * T / (species.molecular_mass_kg() * PhysicsConstants::c_sq));

  for (const auto &line : species.lines)
  {
    lines.emplace_back();
    lines.back().nu = line.nu;

    lines.back().alpha_D = alpha_D_0 * line.nu;
    lines.back().gamma_L = (line.gamma_air * P * (1 - mixing_ratio) + line.gamma_self * P * mixing_ratio) * std::pow(296.0 / T, line.n_air);
    lines.back().S_T = line.sw * (species.Q_value(296) / species.Q_value(T)) * exp(-PhysicsConstants::c2 * line.elower * (1 - T / 296) / T) * ((1 - exp(-PhysicsConstants::c2 * line.nu / T)) / (1 - exp(-PhysicsConstants::c2 * line.nu / 296)));
    lines.back().S_T /= (std::sqrt(M_PI) * lines.back().alpha_D);
  }

  constexpr double LINES_WIDTH = 25;

  double start_nu = Config::NU_START;
  double LBL[Config::MAX_LBL_ENTRIES];

  int lines_start = 0;
  int lines_end = 0;

  double mxy = 0;
  int mxx = 0;

  for (int i = 0; i < Config::NUM_BINS; i++)
  {
    double width = Config::BIN_WIDTHS[i];
    memset(LBL, 0, sizeof LBL);
    int iters = std::round(width / Config::NU_STEP);
    assert(iters <= Config::MAX_LBL_ENTRIES);

    for (int idx = 0; idx < iters; idx++)
    {
      double nu = start_nu + Config::NU_STEP * idx;

      while (lines_end != lines.size() && lines[lines_end].nu <= (nu + LINES_WIDTH))
        lines_end++;
      while (lines_start < lines_end && lines[lines_start].nu <= (nu - LINES_WIDTH))
        lines_start++;

      for (int line = lines_start; line < lines_end; line++)
      {
        double x = (nu - lines[line].nu) / lines[line].alpha_D;
        double y = lines[line].gamma_L / lines[line].alpha_D;
        auto z = std::complex<double>(x, y);
        double correct = faddeeva(z);
        double V = faddeeva(z);
        mxy = std::max(mxy, (V - correct) / correct);
        LBL[idx] += 1 * lines[line].S_T;
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

  return result;
}

const Species species("CO2", 44.01);

struct Workload
{
  const Species &species;
  double T, P, mixing_ratio;
  Binning result;

  Workload(const Species &species, double T, double P, double mixing_ratio) : species(species), T(T), P(P), mixing_ratio(mixing_ratio) {}
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
  while (!stoken.stop_requested())
  {
    std::cout << "Started: " << compute_idx << " Completed: " << completed << " Total: " << tasks.size() << std::endl;
    std::this_thread::sleep_for(std::chrono::milliseconds(5000));
  }
}

int main()
{
  for (int T_idx = 0; T_idx <= 7; T_idx++)
  {
    for (int P_idx = 0; P_idx <= 17; P_idx++)
    {
      for (int vmr_idx = 0; vmr_idx <= 20; vmr_idx++)
      {
        tasks.push_back({species, 180 + 20 * T_idx, std::exp2(-P_idx), (4.2 + 0.21 * vmr_idx) * 1e-4});
      }
    }
  }

  std::jthread watcher_thread(progress_watcher);

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

  return 0;
}