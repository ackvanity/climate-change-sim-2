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
      sim.getCurrentGrid()[i * sim.getCols() + j].type = 1;
    }

  for (int i = (sim.getCols() / 5); i < ((2 * sim.getCols()) / 5); i++)
    for (int j = (sim.getCols() / 5); j < ((2 * sim.getCols()) / 5); j++)
    {
      sim.getCurrentGrid()[i * sim.getCols() + j].T = Urban::T_ATMOSPHERE;
      sim.getCurrentGrid()[i * sim.getCols() + j].type = 0;
    }

  for (int i = ((3 * sim.getCols()) / 5); i < ((4 * sim.getCols()) / 5); i++)
    for (int j = ((3 * sim.getCols()) / 5); j < ((4 * sim.getCols()) / 5); j++)
    {
      sim.getCurrentGrid()[i * sim.getCols() + j].T = Urban::T_ATMOSPHERE;
      sim.getCurrentGrid()[i * sim.getCols() + j].type = 0;
    }

  for (int i = ((1 * sim.getCols()) / 5); i < ((2 * sim.getCols()) / 5); i++)
    for (int j = ((3 * sim.getCols()) / 5); j < ((4 * sim.getCols()) / 5); j++)
    {
      sim.getCurrentGrid()[i * sim.getCols() + j].T = Urban::T_ATMOSPHERE;
      sim.getCurrentGrid()[i * sim.getCols() + j].type = 0;
    }

  for (int i = ((3 * sim.getCols()) / 5); i < ((4 * sim.getCols()) / 5); i++)
    for (int j = ((1 * sim.getCols()) / 5); j < ((2 * sim.getCols()) / 5); j++)
    {
      sim.getCurrentGrid()[i * sim.getCols() + j].T = Urban::T_ATMOSPHERE;
      sim.getCurrentGrid()[i * sim.getCols() + j].type = 0;
    }

  sim.propogateChanges();

  for (int i = 0; i < 100000; i++)
  {
    auto a = std::accumulate(sim.getCurrentGrid(), sim.getCurrentGrid() + sim.getRows() * sim.getCols(), (double)0, [&](const double &acc, const Urban::Cell &c2) -> double
                             { return std::max(acc, c2.T); });
    auto b = std::accumulate(sim.getCurrentGrid(), sim.getCurrentGrid() + sim.getRows() * sim.getCols(), (double)3000, [&](const double &acc, const Urban::Cell &c2) -> double
                             { return std::min(acc, c2.T); });
    if (i % 6 == 0)
      std::cout
          << (i / 6) << " / " << b << " " << a << "\n ";
    sim.step();
  }
}