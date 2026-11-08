#include <bits/stdc++.h>

#ifndef URBAN_H
#define URBAN_H

#include <cstdint>
#include <memory>
#include <string>

namespace Urban
{

  constexpr int NUM_CELL_TYPES = 10;
  constexpr double K_SENSIBLE = 14.0792;
  constexpr double T_ATMOSPHERE = 281.7;

  struct CellData_Hot
  {
    double albedo;
    double k_lateral;
    double k_surface_factor;
    double heat_capacity;
  };

  struct CellData_Cold
  {
    std::string name;
    std::string color;
  };

  struct Cell
  {
    double T;
    int type;
  };

  constexpr double HEAT_TRANSFER_RATE_T_START = 100;
  constexpr double HEAT_TRANSFER_RATE_T_STEP = 5;
  constexpr int HEAT_TRANSFER_RATE_T_STEPS = 60;

  extern double heat_transfer_rate_main_t[7][21][HEAT_TRANSFER_RATE_T_STEPS];

  constexpr double GRID_SIZE = 2;   // in meters
  constexpr double GRID_HEIGHT = 2; // in meters

  class Simulation
  {
  public:
    // Cell data

    CellData_Cold celldata_cold[NUM_CELL_TYPES];
    CellData_Hot celldata_hot[NUM_CELL_TYPES];

    /*
      Gets the current grid

      @returns A pointer to a 2D array with dimension ROWS x COLS containing Cell objects.
      @note The simulation uses a buffer of a certain length (returned by `getSlots()`). This pointer's data will be overwritten when `step()` is called the `getSlots()`th time after the pointer is returned, **or immediately after `propogateChanges()` is called**. If you need to keep stale data longer, use more slots.
    */
    Cell *getCurrentGrid();

    /*
      Propogates changes on the current grid to every other grid.

      @note Will overwrite data on *all* slots, and thus pointers returned by `getCurrentGrid()`
    */

    void propogateChanges();

    // How many slots are available. Minimum and default value is 2.
    int getSlots();

    // Simulation parameters

    // These are picked up on every iteration so can be changed freely at any time

    double dt;          // Time-step of simulation in seconds
    double S0;          // Solar constant in W m^-2
    double time_of_day; // Time of day in hours
    double azimuth;     // Azimuth angle -- 0 or PI at a pole, PI/2 at equator

    // Uses getter/setters because we need to change the heat transfer tables

    double getCo2_ppm();
    double getCh4_ppm();
    void setCo2_ppm(double co2_ppm);
    void setCh4_ppm(double ch4_ppm);

    // These must remain constant so are marked as such

    // Rows in the grid
    int getRows();

    // Columns in the grid
    int getCols();

    // Runs a single step of the simulation
    void step();

    Simulation(int rows, int cols, double azimuth, double co2_ppm = 420, double ch4_ppm = 1, double dt = 30, double S0 = 1361, uint slots = 2);
    Simulation(Simulation &&) = delete;
    ~Simulation();

  private:
    struct Impl;
    std::unique_ptr<Impl> impl;
  };
}

#endif

namespace Urban
{
  double heat_transfer_rate_main_t[7][21][HEAT_TRANSFER_RATE_T_STEPS];

  struct Simulation::Impl
  {
    Simulation *simulation;

    Cell *grid; // We use a multi-slot system
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
    void update(Cell &left, Cell &top, Cell &bottom, Cell &right, Cell &current, Cell &updated, double S_in)
    {
      updated.T = 0;
      updated.T += get_heat_transfer_rate(current.T);
      updated.T += K_SENSIBLE * simulation->celldata_hot[current.type].k_surface_factor * (T_ATMOSPHERE - current.T);
      updated.T += S_in * (1 - simulation->celldata_hot[current.type].albedo);
      updated.T += (left.T - current.T) * 2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[left.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T += (top.T - current.T) * 2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[top.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T += (bottom.T - current.T) * 2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[bottom.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T += (right.T - current.T) * 2 * GRID_HEIGHT / (GRID_SIZE * GRID_SIZE * (1 / simulation->celldata_hot[right.type].k_lateral + 1 / simulation->celldata_hot[current.type].k_lateral));
      updated.T *= simulation->dt;
      updated.T /= simulation->celldata_hot[current.type].heat_capacity * GRID_HEIGHT;
      updated.T += current.T;
    }

    void step()
    {
      int prev_slot = current_slot;
      current_slot++;
      current_slot %= slots;

      double S_in = std::max(sin((simulation->time_of_day - 6) / 12 * M_PI) * simulation->S0 * sin(this->simulation->azimuth), 0.0);
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
      rebuild_heat_transfer_rate_t();
    }

    ~Impl()
    {
      delete[] grid;
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
    celldata_cold[0].name = "Asphalt";
    celldata_cold[0].color = "oklch(0.372 0.044 257.29)";

    celldata_hot[0].albedo = 0.04;
    celldata_hot[0].k_lateral = 0.75 * NU;
    celldata_hot[0].heat_capacity = 1200000;
    celldata_hot[0].k_surface_factor = 1.38;

    celldata_cold[1].name = "Concrete";
    celldata_cold[1].color = "oklch(86.9% 0.022 252.894)";

    celldata_hot[1].albedo = 0.30;
    celldata_hot[1].k_lateral = 0.60 * NU;
    celldata_hot[1].heat_capacity = 1000000;
    celldata_hot[1].k_surface_factor = 1.25;

    celldata_cold[2].name = "Grass";
    celldata_cold[2].color = "#b1d084";

    celldata_hot[2].albedo = 0.25;
    celldata_hot[2].k_lateral = 0.30 * NU;
    celldata_hot[2].heat_capacity = 800000;
    celldata_hot[2].k_surface_factor = 0.97;

    celldata_cold[3].name = "Forest";
    celldata_cold[3].color = "#4a6f15";

    celldata_hot[3].albedo = 0.15;
    celldata_hot[3].k_lateral = 0.30 * NU;
    celldata_hot[3].heat_capacity = 900000;
    celldata_hot[3].k_surface_factor = 0.83;

    celldata_cold[4].name = "Water";
    celldata_cold[4].color = "#4a6f15";

    celldata_hot[4].albedo = 0.06;
    celldata_hot[4].k_lateral = 0.60 * NU;
    celldata_hot[4].heat_capacity = 4000000;
    celldata_hot[4].k_surface_factor = 1.66;
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
}
