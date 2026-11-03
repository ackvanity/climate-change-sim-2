#include <bits/stdc++.h>

constexpr int ROWS = 500;
constexpr int COLS = 500;
constexpr int NUM_CELL_TYPES = 10;

struct CellData_Hot
{
  double albedo;
  double k_lateral;
  double heat_capacity;
};

struct Color
{
  std::uint16_t R, G, B;
  std::uint16_t A = 255U;
};

struct CellData_Cold
{
  std::string name;
  Color color;
};

struct Cell
{
  double T;
  int type;
};

constexpr double HEAT_TRANSFER_RATE_T_START = 100;
constexpr double HEAT_TRANSFER_RATE_T_STEP = 0.5;
constexpr int HEAT_TRANSFER_RATE_T_STEPS = 600;

constexpr double GRID_SIZE = 10; // in meters
constexpr int SLOTS = 2;

class Simulation
{
  CellData_Cold celldata_cold[NUM_CELL_TYPES];
  CellData_Hot celldata_hot[NUM_CELL_TYPES];

  double dt = 10 * 60;    // in seconds
  double S_in = 280;      // Energy intensity per unit area entering the cell
  double time_of_day = 0; // in hours

  Cell grid[SLOTS][ROWS][COLS]; // We use a multi-slot system
  int cur = 0;

  double heat_transfer_rate_t[HEAT_TRANSFER_RATE_T_STEPS];

  // surface temperature, assumes atmosphere remains at constant temperature (same as old simulation). Total heat escaping the surface per area
  double get_heat_transfer_rate(double T)
  {
    int idx = std::clamp<int>((T - HEAT_TRANSFER_RATE_T_START) / HEAT_TRANSFER_RATE_T_STEP, 0, HEAT_TRANSFER_RATE_T_STEPS - 2);
    double frac = (T - HEAT_TRANSFER_RATE_T_START) / HEAT_TRANSFER_RATE_T_STEP - idx;
    return heat_transfer_rate_t[idx] + (heat_transfer_rate_t[idx + 1] - heat_transfer_rate_t[idx]) * frac;
  }

  void update(Cell &left, Cell &top, Cell &bottom, Cell &right, Cell &current, Cell &updated)
  {
    updated.T = 0;
    updated.T -= get_heat_transfer_rate(current.T);
    updated.T += S_in * celldata_hot[current.type].albedo;
    updated.T += (left.T - current.T) * (1 / celldata_hot[left.type].k_lateral + 1 / celldata_hot[current.type].k_lateral) / GRID_SIZE;
    updated.T += (top.T - current.T) * (1 / celldata_hot[top.type].k_lateral + 1 / celldata_hot[current.type].k_lateral) / GRID_SIZE;
    updated.T += (bottom.T - current.T) * (1 / celldata_hot[bottom.type].k_lateral + 1 / celldata_hot[current.type].k_lateral) / GRID_SIZE;
    updated.T += (right.T - current.T) * (1 / celldata_hot[right.type].k_lateral + 1 / celldata_hot[current.type].k_lateral) / GRID_SIZE;
    updated.T /= celldata_hot[right.type].k_lateral;
    updated.T += current.T;
  }

  void step()
  {
    int prev = cur;
    cur++;
    cur %= SLOTS;

    for (int i = 0; i < ROWS; i++)
    {
      for (int j = 1; j < (COLS - 1); j++)
      {
        update(grid[prev][(i - 1 + ROWS) % ROWS][j], grid[prev][i][(j - 1 + COLS) % COLS], grid[prev][i][(j + 1) % COLS], grid[prev][(i + 1) % ROWS][j], grid[prev][i][j], grid[cur][i][j]);
      }
    }

    time_of_day += dt / (60 * 60);
    while (time_of_day > 24)
      time_of_day -= 24;
  }
};

int main()
{
}