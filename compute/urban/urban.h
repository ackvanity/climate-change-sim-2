#if !defined(URBAN_H) || defined(URBAN_NO_GUARD)
#define URBAN_H

#include <cstdint>
#include <memory>
#include <string>

namespace Urban
{

  typedef int cell_type_t;

  constexpr int NUM_CELL_TYPES = 10;
  constexpr double K_SENSIBLE = 14.0792;
  constexpr double T_ATMOSPHERE = 281.7;

  struct CellParam
  {
    bool use_et : 1 = false;
  };

  struct CellData
  {
    double albedo;
    double k_lateral;
    double k_surface_factor;
    double heat_capacity;
    CellParam param;
    std::string name;
    std::string color;
  };

  struct Cell
  {
    double T;
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

    CellData celldata[NUM_CELL_TYPES];

    /*
      Gets the current grid

      @returns A pointer to a 2D array with dimension ROWS x COLS containing Cell objects.
      @note The simulation uses a buffer of a certain length (returned by `getSlots()`). This pointer's data will be overwritten when `step()` is called the `getSlots()`th time after the pointer is returned, **or immediately after `propogateChanges()` is called**. If you need to keep stale data longer, use more slots.
    */
    Cell *getCurrentGrid();

    /*
      Gets the cell types array

      @returns A pointer to a 2D array with dimension ROWS x COLS containing uint8_t
    */
    cell_type_t *getCellTypes();

    // Syncs cell types with internal data structures
    void syncCellTypes();

    /*
      Propogates changes on the current grid state to every other grid.

      @note Will overwrite data on *all* slots, and thus pointers returned by `getCurrentGrid()`
    */

    void propogateChanges();

    // How many slots are available. Minimum and default value is 2.
    int getSlots();

    // Simulation parameters

    // dt is baked into internal data structures when syncCellTypes() is called

    double dt; // Time-step of simulation in seconds

    // These are picked up on every iteration so can be changed freely at any time

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