# Climate Change Simulations

An interactive, educational web demo of how greenhouse gases (CO₂, H₂O, CH₄, N₂O, O₃) shape Earth's atmospheric temperature, built on line-by-line radiative transfer rather than a toy model.

## Structure

```
compute/<project>/            Offline C++/Python physics (not used by the UI directly)
  greenhouse/                   HITRAN → correlated-k tables → radiative-equilibrium solver
  grid/                         Circuit-simulation prototype
interface/<project>/          WASM bridge between compute and UI (C ABI + TypeScript binding)
  greenhouse/
app/simulations/<project>/    Next.js simulation pages
  greenhouse/
app/, components/             Landing page, shared UI components
dependencies/                 Git submodules (Eigen, LBFGSpp, cpp-terminal, AFGL-1986 data),
                              symlinked into the projects that use them
```

Every project keeps its code in its own subfolder under `compute/`, `interface/` and `app/simulations/`.

Pipeline: `export_data.py` downloads HITRAN spectroscopy → `CKD::compute_ckd()` (`ckd.cpp`) builds binary correlated-k tables in `compute/greenhouse/precompute_bin/` → `Greenhouse::init()` / `Greenhouse::compute()` (`greenhouse.cpp`) relax the model and write `final_result.bin` → `interface/greenhouse/build.sh` compiles the solver and tables to WASM in `public/wasm/greenhouse/` → the UI loads it through `interface/greenhouse/greenhouse.ts`. See [`interface/greenhouse/README.md`](interface/greenhouse/README.md).

## Compute architecture (greenhouse)

The offline C++ in `compute/greenhouse/` is a small library, so other simulations (e.g. `urban`) can include the headers and link the sources instead of copying code:

| Module                  | Contents                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.h`              | Spectral bins, g-points and physical constants                                                                                                                                      |
| `ckd.h` / `ckd.cpp`     | `CKD` namespace: HITRAN line data, `Species`, the correlated-k tables (`compute_ckd`)                                                                                               |
| `greenhouse.h` / `.cpp` | `Greenhouse` namespace: `init()` loads data, `compute_atmosphere()` finds one equilibrium, `compute()` runs the sweep                                                               |
| `precompute.cpp`        | Still the original single-file version with `main` (own copy of both modules); a driver for the split files is still to be written. Never link it with `ckd.cpp` / `greenhouse.cpp` |

## Getting started

```bash
git submodule update --init --recursive
pnpm install
pnpm dev            # http://localhost:3000
```

To build the WASM module (requires the [Emscripten SDK](https://emscripten.org/)):

```bash
./interface/greenhouse/build.sh
```

To regenerate the spectroscopic tables (slow, about 4 hours on a 12-core CPU), run from `compute/greenhouse/`:

```bash
python export_data.py        # needs the hapi package and a HITRAN API key
g++ --std=c++20 -O3 -pthread -I. precompute.cpp Faddeeva.cc -o precompute && ./precompute
```

## Status

Work in progress. The correlated-k precomputation is complete; the equilibrium solver is unfinished and the simulation page is still an empty layout shell.

Design tokens and the colour rationale are in [`DESIGN.md`](DESIGN.md).
