#include "urban.h"
#include "tqdm/tqdm.hpp"
#include <bits/stdc++.h>

int main()
{
  std::cout << "START" << std::endl;
  std::ifstream file("precompute_bin_urban/heat_transfer_rate.bin", std::ios::binary);
  file.read(reinterpret_cast<char *>(&Urban::heat_transfer_rate_main_t[0][0][0]), sizeof Urban::heat_transfer_rate_main_t);

  Urban::Simulation sim(500, 500, M_PI / 2);
  for (int i = 0; i < sim.getRows(); i++)
    for (int j = 0; j < sim.getCols(); j++)
    {
      sim.getCurrentGrid()[i * sim.getCols() + j].T = Urban::T_ATMOSPHERE;
      sim.getCurrentGrid()[i * sim.getCols() + j].type = rand() % 5;
    }

  const int STEPS = 1e2;
  auto it = tq::trange(STEPS);
  for (auto i : it)
  {
    for (int i = 0; i < 1e3; i++)
      sim.step();
  }
}