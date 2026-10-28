@AGENTS.md

# Project overview

Educational climate-change simulation site. Computation and UI are deliberately separate:

- `compute/<project>/` — offline C++/Python physics. Never imported by the UI.
- `interface/<project>/` — the only bridge: C++ solver compiled to WASM, plus a typed TS binding. UI code calls this, never `compute/` directly.
- `app/simulations/<project>/`, `components/` — Next.js 16 / React 19 / Tailwind 4 UI.

## Project separation (mandatory)

Each simulation is a "project" with a short name (currently `greenhouse`; `grid` is a prototype). Every project-specific file lives in a subfolder with that name under `compute/`, `interface/` and `app/simulations/`, so projects never share or collide:

```
compute/greenhouse/     interface/greenhouse/     app/simulations/greenhouse/
compute/grid/           interface/grid/           app/simulations/grid/
```

- Never put project code directly in `compute/`, `interface/` or `app/simulations/`.
- Build output is namespaced the same way (e.g. `public/wasm/greenhouse/`).
- Only genuinely shared UI goes in `components/`.

## Dependencies

All third-party code is a git submodule under `dependencies/` (Eigen, LBFGSpp, cpp-terminal, AFGL-1986 data). Projects reference them through symlinks inside the project folder, never by copying and never by reaching into `dependencies/` from build scripts or source. Example: `compute/greenhouse/{Eigen,LBFGSpp,cpp-terminal,afgl-1986}` are symlinks into `dependencies/`. When a project needs a new dependency, add the submodule to `dependencies/` and symlink it into the project.

## Layout

- `compute/greenhouse/` — HITRAN line data → correlated-k tables (`CKD::compute_ckd()`, ~4 h run) → `Greenhouse::init()`, which relaxes the radiative model on a CO₂ × CH₄ grid (baseline anchored to AFGL through `inject_flux`) and writes `precompute_bin/final_result.bin`. `INTERFACE.md` is the contract for that file. `export_data.py` fetches HITRAN. `greenhouse.cpp` is the older copy; `precompute.cpp` supersedes it.
- `compute/grid/` — circuit-simulation prototype (Python), unrelated to greenhouse.
- `interface/greenhouse/` — `src/greenhouse_wasm.cpp` (C ABI: decodes and bilinearly interpolates `final_result.bin`; no solver in the browser), `build.sh` (needs Emscripten), `greenhouse.ts` (binding, `GRID` = range of the table), `mock.ts` (stand-in). Output lands in the gitignored `public/wasm/greenhouse/`; the table is copied to `public/data/greenhouse/final_result.bin` (committed).
- `app/page.tsx` landing page; `app/simulations/greenhouse/page.tsx` the whole simulation page (a client component) with `use-greenhouse.ts` loading the data. `components/`: `simulation.tsx` compound layout (`Simulation.Heading/Main/Sidebar/Footer`), `chart.tsx` (uPlot), `variable-plot.tsx` (pick-the-variables scatter plot), `slider.tsx`, `tabs.tsx`.
- `workpad/` — gitignored scratch for throwaway experiments, per project (`workpad/greenhouse/`). Local only: the precompute audit (`AUDIT.md`) and the from-scratch pipeline (`HOWTO.md`) live there.

## Conventions

- Design tokens live in `DESIGN.md` and `app/globals.css`. Default Tailwind hue palettes are removed; use `primary` (green), `red`, `blue`, `brown`, `yellow` (100–900) and `slate` for neutrals. Prefer green over red for UI emphasis.
- Prettier config is in `.prettierrc.json` (with the Tailwind plugin). Package manager is pnpm.
- C++ is C++20; build with `g++ --std=c++20 -I compute/greenhouse ... compute/greenhouse/Faddeeva.cc` (see `.vscode/tasks.json`). Run `precompute` from `compute/greenhouse/`, since it uses relative paths.
- Never commit HITRAN credentials (`config.json` is gitignored, though older copies are in history).
- A page's code lives in its `page.tsx`. Do not hoist it into sibling files (no barrel pages) unless there is real reuse or need; genuinely general-purpose pieces go in `components/` and the page references them.
- Keep the Status section below current: update it at the end of every iteration of work.

## Status

Precomputation, interface and UI are wired end to end, but the table has not been generated yet, so the page still shows the stand-in model.

- **Precompute (`compute/greenhouse/precompute.cpp`)**: the grid run in `Greenhouse::init()` (CO₂ 420–800 ppm in 19 ppm steps × CH₄ 1.0–4.0 ppm in 0.5 ppm steps: 21 × 7 = 147 relaxations warm-started along CO₂, stopped at |E|² < 1e-7, output `final_result.bin` of 7·21·81 float64 = 95,256 bytes) compiles and its arguments, units, return value and iteration cap are correct. It has not been run: that is the user's step (estimated ~12 h single core, unmeasured). The existing CKD tables cover the chosen ranges.
- **Stop tolerance** (`mag` = |E|²): ground and troposphere error ≈ 1.4·√mag K (1e-4 → 0.01 K); the upper atmosphere converges slower (1e-4 → up to ~1.3 K, 1e-6 → ~0.3 K, 1e-7 → ~0.09 K). Current stop is 1e-4.
- **Interface**: the WASM module decodes and validates the table and interpolates bilinearly (tested natively; the Emscripten build has not been run because `emcc` is not installed here). `loadGreenhouse()` fetches `/data/greenhouse/final_result.bin`; if it is missing the page keeps the mock.
- **To finish**: run the precompute; copy `final_result.bin` to `public/data/greenhouse/` and run `interface/greenhouse/build.sh` (see `compute/greenhouse/INTERFACE.md`).
- **Known model limits** (see the local audit): clear sky; no water-vapour continuum or far-infrared; the CKD g-quadrature under-absorbs in optically thin layers (CO₂ above ~50 km, stratospheric H₂O); slab heights are anchored at the upper edge (`LAYER_ANCHOR = 1`); warming with the anchored baseline is about 2 K per CO₂ doubling, about 0.4 K per CH₄ doubling.

### Progress log (newest first)

- 2026-10-27 — Grid changed to 21 × 7 (19 ppm / 0.5 ppm steps). Interface follows: `greenhouse_wasm.cpp` constants, `GRID` in `greenhouse.ts`, `INTERFACE.md` and `interface/greenhouse/README.md` updated; native test of the decoder regenerated for the new size and passing; `tsc` clean. Interpolation error estimate ≈ 8e-4 K (CO₂), ≈ 9e-3 K (CH₄).
- 2026-10-27 — Grid-size study (1-D balance on the current model, linear interpolation in ppm): 50 CO₂ nodes would give about 1.3e-4 K error and the current 153 nodes about 1.4e-5 K, both far below the solver's ~0.01 K ground error at `mag` < 1e-4. The fewest nodes for a 0.01 K interpolation error are about 7 for CO₂ (63 ppm steps) and 7 for CH₄ (0.5 ppm steps); 0.001 K needs about 19 and 26. The grid in `precompute.cpp` is unchanged; if it changes, update the three places listed in `compute/greenhouse/INTERFACE.md`.
- 2026-10-27 — UI: sliders now follow the table's range (`GRID`); the macro plot is the general-purpose `components/variable-plot.tsx`; `greenhouse-view.tsx` merged into `page.tsx`; baseline in the profile chart is the table's lowest corner.
- 2026-10-27 — Interface glue: new WASM (decode + interpolate), `compute/greenhouse/INTERFACE.md`, binding with `GRID`, native test of the C++. Tolerance study for the stop rule.
- 2026-10-27 — Precompute review: gravity added to the pressure step, grid-loop bugs fixed (units, return, result type, cap). Audit of `precompute.cpp` found the CKD quadrature and pressure issues.
- 2026-10-26 — Warming validated with the 1-D balance (log-like in CO₂, about 1.4 K per doubling there) and with the relaxation model (about 2 K per doubling with the anchored baseline).
