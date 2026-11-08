# interface/urban

The only bridge between the urban cell-grid solver (`compute/urban/compute.cpp`) and the UI. UI code imports
`urban.ts`; it never touches `compute/`.

| File                 | Role                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/urban_wasm.cpp` | C ABI over the solver: create/step, parameters, painting, statistics, RGBA rendering                           |
| `build.sh`           | Compiles `urban_wasm.cpp` + `compute.cpp` with Emscripten into `public/wasm/urban/` (gitignored)               |
| `shim/bits/stdc++.h` | Stand-in for GCC's `<bits/stdc++.h>` (not in libc++); lets `compute.cpp` compile unchanged                     |
| `urban.ts`           | Typed binding: `loadUrban()` returns an `Urban` with `reset`, `step`, `paint`, `stats`, `renderTemperature`, … |

## Data

`compute/urban/precompute_bin_urban/heat_transfer_rate.bin` is copied to `public/data/urban/heat_transfer_rate.bin`
(committed). Layout: `7 (CH₄) × 21 (CO₂) × 60 (T)` little-endian doubles, 70,560 bytes. CH₄ 1.0–4.0 ppm in 0.5 ppm steps,
CO₂ 420–800 ppm in 19 ppm steps, T from 100 K in 5 K steps (`HEAT_TRANSFER_RATE_T_*` in `urban.h`; the loader checks the byte count). Each value is the ground's net infrared gain in W/m² with the
atmosphere fixed at the AFGL baseline (no sunlight, no convection; the sensible term is added in the simulation).
`loadUrban()` checks the byte count and that every value is finite, writes the bytes into WASM memory, and only then
creates a simulation (the constructor builds its working table from it).

## Things to know

- **Rebuild** with `interface/urban/build.sh` whenever `compute/urban/` changes (needs `em++`).
- The solver keeps the material of every cell in `getCellTypes()` and derives per-cell constants from it in
  `syncCellTypes()`, which also bakes in `dt`. `urban_wasm.cpp` only marks that state dirty when you paint, fill, load a
  map or change `dt`, and syncs once before the next step, so a brush stroke costs one pass over the grid.
- One simulation exists at a time; `reset()` replaces it. Materials are read once (stable array for React).
- `renderMaterials` / `renderTemperature` return a view into WASM memory; use it before the next call into the module.
- The build passes `-Duint=unsigned` because `urban.h` uses the glibc typedef `uint`, and compiles the solver with
  `-ffast-math` but the wrapper without it: fast-math folds `std::isfinite()` to `true`, which would blind the check for a
  diverged run (`ur_stats` counts non-finite cells).
- Grids must be at least 3 × 3 (the solver's edge handling), `dt` must keep the explicit scheme stable (see
  `TIME_STEP_S` in `urban.ts`), and a cell is `CELL_SIZE_M` (2 m) wide.
