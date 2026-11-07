#include <iostream>
#include <cassert>
#include <algorithm>
#include <numeric>
#include <thread>
#include <atomic>
#include <fstream>
#include <mutex>
#include <utility>
#include "tqdm/tqdm.hpp"
#include "../greenhouse/greenhouse.h"
#include "urban.h"

namespace Urban
{
  std::atomic<int> counter;
  constexpr int RUNS = 7 * 21 * HEAT_TRANSFER_RATE_T_STEPS;

  // hoisted to avoid race condition
  double k_sensible;

  double heat_transfer_rate_main_t[7][21][HEAT_TRANSFER_RATE_T_STEPS];

  void init()
  {
    Greenhouse::init();

    std::vector<double> T(Greenhouse::n);

    for (int i = 0; i < (Greenhouse::n - 1); i++)
      T[i] = Greenhouse::afgl[i + 1][2];

    // Find J sensibility
    // Compute from the energy corrections first
    T.back() = Greenhouse::afgl[0][2];

    std::fill(std::begin(Greenhouse::inject_flux), std::end(Greenhouse::inject_flux), 0);
    std::fill(std::begin(Greenhouse::S0), std::end(Greenhouse::S0), 0);

    auto total_error = Greenhouse::compute_energy_error(T, 330e-6, 1.93e-6, false);
    const double avg_solar_input = 1361.0 / (4); // Standard formula

    // Assume constant for entire planet
    // Assume all of the Sun's energy goes to the surface
    k_sensible = (avg_solar_input * 0.7 + total_error[0]) / (T.back() - T[0]);
    std::cout << "Sensible k (copy to urban.h): " << k_sensible << std::endl;
    std::cout << "Atmosphere temperature (copy to urban.h): " << T[0] << std::endl;
  }

  void compute_section(int co2_idx, int ch4_idx)
  {

    double ch4 = 1.0 + 0.5 * ch4_idx;
    double co2 = 420 + 19 * co2_idx;

    std::vector<double> T(Greenhouse::n);

    for (int i = 0; i < (Greenhouse::n - 1); i++)
      T[i] = Greenhouse::afgl[i + 1][2];

    // So, to find total energy diff
    // energy_error + solar_input + k_sensible * (T_A - T_E), with T_A being the first atmosphere slab's temperature
    // we handle solar_input and k_sensible in the real code, here just precompute energy_error plus sensible term.

    for (int i = 0; i < HEAT_TRANSFER_RATE_T_STEPS; i++)
    {
      T.back() = HEAT_TRANSFER_RATE_T_START + HEAT_TRANSFER_RATE_T_STEP * i;
      heat_transfer_rate_main_t[ch4_idx][co2_idx][i] = Greenhouse::compute_energy_error(T, co2 * 1e-6, ch4 * 1e-6, false)[0];
      counter++;

      counter.notify_one();
    }
  }
}

std::vector<std::pair<int, int>> workloads;
std::mutex vector_mutex;

void worker()
{
  while (true)
  {
    int co2_idx, ch4_idx;
    {
      std::scoped_lock lock(vector_mutex);
      if (!workloads.size())
        return;
      co2_idx = workloads.back().first;
      ch4_idx = workloads.back().second;
      workloads.pop_back();
    }
    Urban::compute_section(co2_idx, ch4_idx);
  }
}

void watcher()
{
  auto it = tq::trange(Urban::RUNS);
  for (int a : it)
  {
    while (a >= Urban::counter)
    {
      assert(a == Urban::counter);
      Urban::counter.wait(a);
    }
    it << "Done: " << Urban::counter;
  }
}

int main()
{
  Urban::init();
  std::jthread watcher_thread(watcher);
  std::vector<std::thread> threads;

  for (int ch4_idx = 0; ch4_idx < 7; ch4_idx++)
  {
    for (int co2_idx = 0; co2_idx < 21; co2_idx++)
    {
      workloads.push_back({co2_idx, ch4_idx});
    }
  }

  for (int i = 0; i < Config::NUM_THREADS; i++)
  {
    threads.emplace_back(worker);
  }

  for (auto &i : threads)
  {
    i.join();
  }

  std::ofstream file("precompute_bin_urban/heat_transfer_rate.bin", std::ios::binary);
  if (!file.is_open())
  {
    throw std::runtime_error("Cannot open file precompute_bin_urban/heat_transfer_rate.bin for writing!");
  }
  file.write(reinterpret_cast<char *>(Urban::heat_transfer_rate_main_t), sizeof Urban::heat_transfer_rate_main_t);
}