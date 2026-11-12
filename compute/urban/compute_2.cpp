#include <bits/stdc++.h>
#include "urban.h"

namespace Urban
{
  double heat_transfer_rate_main_t[7][21][HEAT_TRANSFER_RATE_T_STEPS];

  struct Simulation::Impl
  {
    Simulation *simulation;

    Cell *grid; // We use a multi-slot system

    // SoA approach
    double *one_min_albedo;
    cell_type_t *cell_types;
    CellParam *cell_params;

    // already final form
    double *k_lateral_left;
    double *k_lateral_right;
    double *k_lateral_top;
    double *k_lateral_bottom;

    double *k_surface;     // already factoring in K_SENSIBLE
    double *heat_capacity; // per cell, includes dt!

    uint slots;
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
    void update(int idx_left, int idx_top, int idx_bottom, int idx_right, int idx_cur, int idx_res, int idx, double S_in)
    {
      double dT = 0;
      dT += get_heat_transfer_rate(grid[idx_cur].T);
      dT += S_in * one_min_albedo[idx];
      if (cell_params[idx].use_et)
      {
        // Priestley-Taylor
        const double delta = (610.78) * std::exp(17.27 * (grid[idx_cur].T - 273.15) / (grid[idx_cur].T - 35.85)) * (237.3 * 17.27 / ((grid[idx_cur].T - 35.85) * (grid[idx_cur].T - 35.85)));
        dT -= std::max(0.0, 1.26 * delta * dT / (delta + 66));
      }
      dT += k_surface[idx] * (T_ATMOSPHERE - grid[idx_cur].T);
      dT += k_lateral_left[idx] * (grid[idx_left].T - grid[idx_cur].T);
      dT += k_lateral_top[idx] * (grid[idx_top].T - grid[idx_cur].T);
      dT += k_lateral_bottom[idx] * (grid[idx_bottom].T - grid[idx_cur].T);
      dT += k_lateral_right[idx] * (grid[idx_right].T - grid[idx_cur].T);
      dT /= heat_capacity[idx];
      grid[idx_res].T = dT + grid[idx_cur].T;
    }

    void step()
    {
      int prev_slot = current_slot;
      current_slot++;
      current_slot %= slots;

      double S_in = std::max(sin((simulation->time_of_day - 6) / 12 * M_PI) * simulation->S0 * sin(this->simulation->azimuth), 0.0);
      for (unsigned int i = 1; i < (rows - 1); i++)
      {
        for (unsigned int j = 1; j < (cols - 1); j++)
        {
          update(prev_slot * rows * cols + i * cols + (j - 1),
                 prev_slot * rows * cols + (i - 1) * cols + j,
                 prev_slot * rows * cols + (i + 1) * cols + j,
                 prev_slot * rows * cols + i * cols + (j + 1),
                 prev_slot * rows * cols + i * cols + j,
                 current_slot * rows * cols + i * cols + j,
                 i * cols + j,
                 S_in);
        }
      }

      {
        unsigned int i = 0;

        for (unsigned int j = 0; j < (cols); j++)
        {
          update(prev_slot * rows * cols + i * cols + (j - 1 + cols) % cols,
                 prev_slot * rows * cols + (rows - 1) * cols + j,
                 prev_slot * rows * cols + (1) * cols + j,
                 prev_slot * rows * cols + i * cols + (j + 1) % cols,
                 prev_slot * rows * cols + i * cols + j,
                 current_slot * rows * cols + i * cols + j,
                 i * cols + j,
                 S_in);
        }
      }

      {
        unsigned int i = rows - 1;

        for (unsigned int j = 0; j < (cols); j++)
        {
          update(prev_slot * rows * cols + i * cols + (j - 1 + cols) % cols,
                 prev_slot * rows * cols + (rows - 2) * cols + j,
                 prev_slot * rows * cols + (0) * cols + j,
                 prev_slot * rows * cols + i * cols + (j + 1) % cols,
                 prev_slot * rows * cols + i * cols + j,
                 current_slot * rows * cols + i * cols + j,
                 i * cols + j,
                 S_in);
        }
      }

      {
        unsigned int j = cols - 1;
        for (unsigned int i = 1; i < (rows - 1); i++)
        {
          update(prev_slot * rows * cols + i * cols + (cols - 2),
                 prev_slot * rows * cols + (i - 1) * cols + j,
                 prev_slot * rows * cols + (i + 1) * cols + j,
                 prev_slot * rows * cols + i * cols + (0),
                 prev_slot * rows * cols + i * cols + j,
                 current_slot * rows * cols + i * cols + j,
                 i * cols + j,
                 S_in);
        }
      }

      {
        unsigned int j = 0;
        for (unsigned int i = 1; i < (rows - 1); i++)
        {
          update(prev_slot * rows * cols + i * cols + (cols - 1),
                 prev_slot * rows * cols + (i - 1) * cols + j,
                 prev_slot * rows * cols + (i + 1) * cols + j,
                 prev_slot * rows * cols + i * cols + (1),
                 prev_slot * rows * cols + i * cols + j,
                 current_slot * rows * cols + i * cols + j,
                 i * cols + j,
                 S_in);
        }
      }

      /*
          update(prev_slot * rows * cols + i * cols + (j - 1 + cols) % cols,
                 prev_slot * rows * cols + ((i - 1 + rows) % rows) * cols + j,
                 prev_slot * rows * cols + ((i + 1) % rows) * cols + j,
                 prev_slot * rows * cols + i * cols + (j + 1) % cols,
                 prev_slot * rows * cols + i * cols + j,
                 current_slot * rows * cols + i * cols + j,
                 i * cols + j,
                 S_in);
      */

      simulation->time_of_day += simulation->dt / (60 * 60);
      while (simulation->time_of_day >= 24)
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
        heat_transfer_rate_t[i] = std::lerp(std::lerp(heat_transfer_rate_main_t[ch4_idx][co2_idx][i], heat_transfer_rate_main_t[ch4_idx + 1][co2_idx][i], ch4_frac), std::lerp(heat_transfer_rate_main_t[ch4_idx][co2_idx + 1][i], heat_transfer_rate_main_t[ch4_idx + 1][co2_idx + 1][i], ch4_frac), co2_frac);
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

    int getRows()
    {
      return rows;
    }
    int getCols()
    {
      return cols;
    }

    void syncCellTypes()
    {
      for (int i = 0; i < (rows * cols); i++)
      {
        one_min_albedo[i] = 1 - this->simulation->celldata[cell_types[i]].albedo;
        k_surface[i] = this->simulation->celldata[cell_types[i]].k_surface_factor * K_SENSIBLE;
        heat_capacity[i] = this->simulation->celldata[cell_types[i]].heat_capacity * GRID_HEIGHT / simulation->dt;
        cell_params[i] = this->simulation->celldata[cell_types[i]].param;
      }

      for (int i = 0; i < rows; i++)
      {
        for (int j = 0; j < cols; j++)
        {
          k_lateral_left[i * cols + j] = (2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE)) / (1 / this->simulation->celldata[cell_types[i * cols + j]].k_lateral + 1 / this->simulation->celldata[cell_types[i * cols + (j - 1 + cols) % cols]].k_lateral);
          k_lateral_top[i * cols + j] = (2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE)) / (1 / this->simulation->celldata[cell_types[i * cols + j]].k_lateral + 1 / this->simulation->celldata[cell_types[((i - 1 + rows) % rows) * cols + j]].k_lateral);
          k_lateral_bottom[i * cols + j] = (2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE)) / (1 / this->simulation->celldata[cell_types[i * cols + j]].k_lateral + 1 / this->simulation->celldata[cell_types[((i + 1) % rows) * cols + j]].k_lateral);
          k_lateral_right[i * cols + j] = (2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE)) / (1 / this->simulation->celldata[cell_types[i * cols + j]].k_lateral + 1 / this->simulation->celldata[cell_types[i * cols + (j + 1) % cols]].k_lateral);
        }
      }
    }

    Impl(int rows, int cols, double azimuth, double co2_ppm, double ch4_ppm, double dt, double S0, uint slots, Simulation *simulation)
    {
      if (slots <= 1)
        throw std::invalid_argument("Number of slots must be at least 2.");
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
      this->simulation->azimuth = azimuth;

      grid = new Cell[slots * rows * cols];
      one_min_albedo = new double[rows * cols];
      k_lateral_left = new double[rows * cols];
      k_lateral_right = new double[rows * cols];
      k_lateral_top = new double[rows * cols];
      k_lateral_bottom = new double[rows * cols];
      k_surface = new double[rows * cols];
      heat_capacity = new double[rows * cols];
      cell_types = new cell_type_t[rows * cols];
      cell_params = new CellParam[rows * cols];

      rebuild_heat_transfer_rate_t();
    }

    ~Impl()
    {
      delete[] grid;
      delete[] one_min_albedo;
      delete[] k_lateral_left;
      delete[] k_lateral_right;
      delete[] k_lateral_top;
      delete[] k_lateral_bottom;
      delete[] k_surface;
      delete[] heat_capacity;
      delete[] cell_types;
      delete[] cell_params;
    }
  };

  Cell *Simulation::getCurrentGrid()
  {
    return &this->impl->grid[this->impl->current_slot * this->impl->rows * this->impl->cols];
  }

  void Simulation::propogateChanges()
  {
    Cell *ptr = getCurrentGrid();
    for (int slot = 0; slot < this->impl->slots; slot++)
    {
      if (slot == this->impl->current_slot)
        continue;
      memcpy(&this->impl->grid[slot * this->impl->rows * this->impl->cols], ptr, (sizeof(Cell)) * this->impl->rows * this->impl->cols);
    }
  }

  Simulation::Simulation(int rows, int cols, double azimuth, double co2_ppm, double ch4_ppm, double dt, double S0, uint slots)
  {
    this->impl.reset(new Impl(rows, cols, azimuth, co2_ppm, ch4_ppm, dt, S0, slots, this));

    const double NU = 15000;

    // Initialize data
    celldata[0].name = "Asphalt";
    celldata[0].color = "oklch(0.372 0.044 257.29)";

    celldata[0].albedo = 0.04;
    celldata[0].k_lateral = 0.75 * NU;
    celldata[0].heat_capacity = 1200000;
    celldata[0].k_surface_factor = 1.38;

    celldata[1].name = "Concrete";
    celldata[1].color = "oklch(86.9% 0.022 252.894)";

    celldata[1].albedo = 0.30;
    celldata[1].k_lateral = 0.60 * NU;
    celldata[1].heat_capacity = 1000000;
    celldata[1].k_surface_factor = 1.25;

    celldata[2].name = "Grass";
    celldata[2].color = "#b1d084";

    celldata[2].albedo = 0.25;
    celldata[2].k_lateral = 0.30 * NU;
    celldata[2].heat_capacity = 800000;
    celldata[2].k_surface_factor = 0.8;
    celldata[2].param.use_et = true;

    celldata[3].name = "Forest";
    celldata[3].color = "#4a6f15";

    celldata[3].albedo = 0.15;
    celldata[3].k_lateral = 0.30 * NU;
    celldata[3].heat_capacity = 900000;
    celldata[3].k_surface_factor = 0.8;
    celldata[3].param.use_et = true;

    celldata[4].name = "Water";
    celldata[4].color = "#8ab3b4";

    celldata[4].albedo = 0.06;
    celldata[4].k_lateral = 0.60 * NU;
    celldata[4].heat_capacity = 4000000;
    celldata[4].k_surface_factor = 1.66;
    celldata[4].param.use_et = true;
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

  int Simulation::getRows()
  {
    return this->impl->getRows();
  }

  int Simulation::getCols()
  {
    return this->impl->getCols();
  }

  void Simulation::step()
  {
    this->impl->step();
  }

  Simulation::~Simulation() = default;

  double *get_heat_transfer_rate_t_ptr()
  {
    return &heat_transfer_rate_main_t[0][0][0];
  }

  cell_type_t *Simulation::getCellTypes()
  {
    return this->impl->cell_types;
  }

  void Simulation::syncCellTypes()
  {
    this->impl->syncCellTypes();
  }
}
