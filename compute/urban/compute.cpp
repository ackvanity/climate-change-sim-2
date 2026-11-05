#include <bits/stdc++.h>
#include "urban.h"

namespace Urban
{
  double heat_transfer_rate_main_t[7][21][HEAT_TRANSFER_RATE_T_STEPS];

  struct Simulation::Impl
  {
    Simulation *simulation;

    Cell *grid; // We use a multi-slot system
    int slots;
    int rows;
    int cols;
    int current_slot = 0;

    double heat_transfer_rate_t[HEAT_TRANSFER_RATE_T_STEPS];

    // surface temperature, assumes atmosphere remains at constant temperature (same as old simulation). Total heat escaping the surface per area
    double get_heat_transfer_rate(double T)
    {
      int idx = std::clamp<int>((T - HEAT_TRANSFER_RATE_T_START) / HEAT_TRANSFER_RATE_T_STEP, 0, HEAT_TRANSFER_RATE_T_STEPS - 2);
      double frac = (T - HEAT_TRANSFER_RATE_T_START) / HEAT_TRANSFER_RATE_T_STEP - idx;
      return (heat_transfer_rate_t[idx] + (heat_transfer_rate_t[idx + 1] - heat_transfer_rate_t[idx]) * frac);
    }

    // Updates a single cell
    void update(Cell &left, Cell &top, Cell &bottom, Cell &right, Cell &current, Cell &updated, double S_in)
    {
      updated.T = 0;
      updated.T -= get_heat_transfer_rate(current.T);
      updated.T += S_in * (1 - simulation->celldata_hot[current.type].albedo);
      updated.T += (left.T - current.T) * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[left.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T += (top.T - current.T) * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[top.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T += (bottom.T - current.T) * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[bottom.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T += (right.T - current.T) * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[right.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T *= simulation->dt;
      updated.T /= simulation->celldata_hot[current.type].heat_capacity;
      updated.T += current.T;
    }

    void step()
    {
      int prev_slot = current_slot;
      current_slot++;
      current_slot %= SLOTS;

      double S_in = std::max(cos((18 - 6) / 12 * M_PI) * simulation->S0 / 4, 0.0);
      for (unsigned int i = 0; i < rows; i++)
      {
        for (unsigned int j = 0; j < cols; j++)
        {
          update(grid[prev_slot * rows * cols + ((i - 1 + rows) % rows) * cols + j],
                 grid[prev_slot * rows * cols + i * cols + (j - 1 + cols) % cols],
                 grid[prev_slot * rows * cols + i * cols + (j + 1) % cols],
                 grid[prev_slot * rows * cols + ((i + 1) % rows) * cols + j],
                 grid[prev_slot * rows * cols + i * cols + j],
                 grid[current_slot * rows * cols + i * cols + j],
                 S_in);
        }
      }

      simulation->time_of_day += simulation->dt / (60 * 60);
      while (simulation->time_of_day > 24)
        simulation->time_of_day -= 24;
    }

    double co2_ppm = 420;
    double ch4_ppm = 1;

    void rebuild_heat_transfer_rate_t()
    {
      double co2_loc = (co2_ppm - 420) / 19;
      int co2_idx = std::clamp<int>(std::trunc(co2_loc), 0, 19);
      double co2_frac = co2_loc - co2_idx;

      double ch4_loc = (ch4_ppm - 1) / 0.5;
      int ch4_idx = std::clamp<int>(std::trunc(ch4_loc), 0, 5);
      double ch4_frac = ch4_loc - ch4_idx;

      for (int i = 0; i < HEAT_TRANSFER_RATE_T_STEPS; i++)
      {
        heat_transfer_rate_t[i] = std::lerp(std::lerp(heat_transfer_rate_main_t[ch4_idx][co2_idx][i], heat_transfer_rate_main_t[ch4_idx + 1][co2_idx][i], ch4_frac), std::lerp(heat_transfer_rate_main_t[ch4_idx][co2_idx + 1][i], heat_transfer_rate_main_t[ch4_idx + 1][co2_idx + 1][i], ch4_frac), co2_idx);
      }
    }

    double getCo2_ppm()
    {
      return co2_ppm;
    }
    double getCh4_ppm()
    {
      return ch4_ppm;
    }
    void setCo2_ppm(double co2_ppm)
    {
      this->co2_ppm = co2_ppm;
      rebuild_heat_transfer_rate_t();
    }
    void setCh4_ppm(double ch4_ppm)
    {
      this->ch4_ppm = ch4_ppm;
      rebuild_heat_transfer_rate_t();
    }

    Impl(int rows, int cols, double co2_ppm, double ch4_ppm, double dt, double S0, int slots, Simulation *simulation)
    {
      this->simulation = simulation;
      this->rows = rows;
      this->cols = cols;
      this->slots = slots;
      this->co2_ppm = co2_ppm;
      this->ch4_ppm = ch4_ppm;
      this->simulation = simulation;
      this->simulation->dt = dt;
      this->simulation->S0 = S0;
      this->simulation->time_of_day = 0;

      grid = new Cell[slots * rows * cols];
    }
  };

  Cell *Simulation::getCurrentGrid()
  {
    return &this->impl->grid[this->impl->current_slot * this->impl->rows * this->impl->cols];
  }

  Simulation::Simulation(int rows, int cols, double co2_ppm, double ch4_ppm, double dt, double S0, int slots)
  {
    this->impl.reset(new Impl(rows, cols, co2_ppm, ch4_ppm, dt, S0, slots, this));
  }

  int Simulation::getSlots()
  {
    return this->impl->slots;
  }

  double Simulation::getCo2_ppm()
  {
    return this->impl->getCo2_ppm();
  }

  double Simulation::getCh4_ppm()
  {
    return this->impl->getCh4_ppm();
  }

  void Simulation::setCo2_ppm(double co2_ppm)
  {
    return this->impl->setCo2_ppm(co2_ppm);
  }

  void Simulation::setCh4_ppm(double ch4_ppm)
  {
    return this->impl->setCh4_ppm(ch4_ppm);
  }

  void Simulation::step()
  {
    this->impl->step();
  }
}