// Compares performance between two (or more version)
// API can change from time-to-time, take caution
#include <bits/stdc++.h>
#define ANKERL_NANOBENCH_IMPLEMENT
#include "nanobench.h"

#define URBAN_NO_GUARD

namespace Fast
{
#include "compute.cpp"
}

namespace Slow
{
#include "compute_2.cpp"
}

int main()
{
  std::ifstream file("precompute_bin_urban/heat_transfer_rate.bin", std::ios::binary);
  file.read(reinterpret_cast<char *>(&Fast::Urban::heat_transfer_rate_main_t[0][0][0]), sizeof Fast::Urban::heat_transfer_rate_main_t);
  memcpy(&Slow::Urban::heat_transfer_rate_main_t[0][0], &Fast::Urban::heat_transfer_rate_main_t[0][0][0], sizeof Fast::Urban::heat_transfer_rate_main_t);

  Fast::Urban::Simulation fast(500, 500, M_PI / 2);
  Slow::Urban::Simulation slow(500, 500, M_PI / 2);
  for (int i = 0; i < fast.getRows(); i++)
    for (int j = 0; j < fast.getCols(); j++)
    {
      fast.getCurrentGrid()[i * fast.getCols() + j].T = slow.getCurrentGrid()[i * fast.getCols() + j].T = Fast::Urban::T_ATMOSPHERE;
      fast.getCellTypes()[i * fast.getCols() + j] = slow.getCellTypes()[i * fast.getCols() + j] = rand() % 5;
    }

  fast.syncCellTypes();
  slow.syncCellTypes();

  auto bench = ankerl::nanobench::Bench().relative(true).warmup(100).minEpochIterations(110).epochs(5e2);
  bench.compare("Fast, 500x500", [&]()
                { fast.step(); }, "Slow, 500x500", [&]()
                { slow.step(); });
}