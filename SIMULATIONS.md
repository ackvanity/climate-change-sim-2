# Simulations

Each simulation is a "project". Its **code** is the short lowercase name used for every project folder (`compute/<code>/`, `interface/<code>/`, `app/simulations/<code>/`, `public/wasm/<code>/`, `workpad/<code>/`). See `CLAUDE.md` for the separation rules and `LOGS.md` for progress.

## Overview

| Simulation                         | Code         | Stage                                                     |
| ---------------------------------- | ------------ | --------------------------------------------------------- |
| Greenhouse Effect / Global Warming | `greenhouse` | Working end to end (precompute → WASM → UI)               |
| Urban Heat (cell-grid heat model)  | `urban`      | Started: data structures only in `compute/urban/main.cpp` |
| Electric Grid                      | `grid`       | Prototype, unrelated to the others                        |

## Code locations

| Code         | `compute/`                          | `interface/`                                | `app/simulations/`            | `workpad/`            |
| ------------ | ----------------------------------- | ------------------------------------------- | ----------------------------- | --------------------- |
| `greenhouse` | `compute/greenhouse/` (C++, Python) | `interface/greenhouse/` (WASM + TS binding) | `app/simulations/greenhouse/` | `workpad/greenhouse/` |
| `urban`      | `compute/urban/` (C++)              | —                                           | —                             | `workpad/urban/`      |
| `grid`       | `compute/grid/` (Python)            | —                                           | —                             | —                     |

## Key files

| Code         | File                                           | Role                                                                                                 |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `greenhouse` | `compute/greenhouse/greenhouse.cpp`            | `Greenhouse` namespace: relaxes the radiative model on the CO₂ × CH₄ grid, writes `final_result.bin` |
| `greenhouse` | `compute/greenhouse/ckd.{h,cpp}`               | Correlated-k tables from HITRAN lines (`CKD` namespace)                                              |
| `greenhouse` | `compute/greenhouse/greenhouse.h`              | Interface of the model, for other simulations to include                                             |
| `greenhouse` | `compute/greenhouse/precompute.cpp`            | Original single-file version with `main` (to be replaced by a driver)                                |
| `greenhouse` | `compute/greenhouse/INTERFACE.md`              | Contract for `final_result.bin`                                                                      |
| `greenhouse` | `interface/greenhouse/src/greenhouse_wasm.cpp` | Decodes and bilinearly interpolates the table                                                        |
| `greenhouse` | `interface/greenhouse/greenhouse.ts`           | Typed binding, `GRID` = range of the table                                                           |
| `greenhouse` | `app/simulations/greenhouse/page.tsx`          | The simulation page                                                                                  |
| `urban`      | `compute/urban/main.cpp`                       | Cell and per-type data structures (albedo, conductivity, heat capacity)                              |
| `grid`       | `compute/grid/`                                | Circuit-simulation prototype                                                                         |
