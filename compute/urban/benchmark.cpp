#define ANKERL_NANOBENCH_IMPLEMENT
#include "nanobench.h"
#include "urban.h"
#include <bits/stdc++.h>

int main()
{
  std::ifstream file("precompute_bin_urban/heat_transfer_rate.bin", std::ios::binary);
  file.read(reinterpret_cast<char *>(&Urban::heat_transfer_rate_main_t[0][0][0]), sizeof Urban::heat_transfer_rate_main_t);

  Urban::Simulation sim(500, 500, M_PI / 2);
  for (int i = 0; i < sim.getRows(); i++)
    for (int j = 0; j < sim.getCols(); j++)
    {
      sim.getCurrentGrid()[i * sim.getCols() + j].T = Urban::T_ATMOSPHERE;
      sim.getCellTypes()[i * sim.getCols() + j] = rand() % 5;
    }

  sim.syncCellTypes();

  ankerl::nanobench::Bench().warmup(100).minEpochIterations(110).epochs(1e2).run("simulation, 500x500", [&]()
                                                                                 { sim.step(); });
}