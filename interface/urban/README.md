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
(committed). Layout: `7 (CH₄) × 21 (CO₂) × 600 (T)` little-endian doubles, 705,600 bytes. CH₄ 1.0–4.0 ppm in 0.5 ppm steps,
CO₂ 420–800 ppm in 19 ppm steps, T from 100 K in 0.5 K steps. Each value is the ground's net infrared gain in W/m² with the
atmosphere fixed at the AFGL baseline (no sunlight, no convection; the sensible term is added in the simulation).
`loadUrban()` checks the byte count and that every value is finite, writes the bytes into WASM memory, and only then
creates a simulation (the constructor builds its working table from it).

## Things to know

- **Rebuild** with `interface/urban/build.sh` whenever `compute/urban/` changes (needs `em++`).
- `update()` in the solver does not copy `Cell::type` between its slots, so every edit has to write the type into every slot.
  `urban_wasm.cpp` learns the slot addresses at creation and does this for `paint`, `fill` and `loadTypes`.
- One simulation exists at a time; `reset()` replaces it. Materials are read once (stable array for React).
- `renderMaterials` / `renderTemperature` return a view into WASM memory; use it before the next call into the module.
- The build passes `-Duint=unsigned` because `urban.h` uses the glibc typedef `uint`.
