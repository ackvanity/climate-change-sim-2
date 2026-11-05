@AGENTS.md

# Project overview

Educational climate-change simulation site. Computation and UI are deliberately separate:

- `compute/<project>/` — offline C++/Python physics. Never imported by the UI.
- `interface/<project>/` — the only bridge: C++ solver compiled to WASM, plus a typed TS binding. UI code calls this, never `compute/` directly.
- `app/simulations/<project>/`, `components/` — Next.js 16 / React 19 / Tailwind 4 UI.

## Project separation (mandatory)

Each simulation is a "project" with a short name (currently `greenhouse`; `urban` is just started; `grid` is a prototype). Every project-specific file lives in a subfolder with that name under `compute/`, `interface/` and `app/simulations/`, so projects never share or collide:

```
compute/greenhouse/     interface/greenhouse/     app/simulations/greenhouse/
compute/urban/          interface/urban/          app/simulations/urban/
compute/grid/           interface/grid/           app/simulations/grid/
```

- Never put project code directly in `compute/`, `interface/` or `app/simulations/`.
- Build output is namespaced the same way (e.g. `public/wasm/greenhouse/`).
- Only genuinely shared UI goes in `components/`.

## Dependencies

All third-party code is a git submodule under `dependencies/` (Eigen, LBFGSpp, cpp-terminal, AFGL-1986 data). Projects reference them through symlinks inside the project folder, never by copying and never by reaching into `dependencies/` from build scripts or source. Example: `compute/greenhouse/{Eigen,LBFGSpp,cpp-terminal,afgl-1986}` are symlinks into `dependencies/`. When a project needs a new dependency, add the submodule to `dependencies/` and symlink it into the project.

## Layout

- `compute/greenhouse/` — HITRAN line data → correlated-k tables (`CKD::compute_ckd()`, ~4 h run) → `Greenhouse::init()`, which relaxes the radiative model on a CO₂ × CH₄ grid (baseline anchored to AFGL through `inject_flux`) and writes `precompute_bin/final_result.bin`. `INTERFACE.md` is the contract for that file. `export_data.py` fetches HITRAN. Code is split: `ckd.{h,cpp}` (CKD tables), `greenhouse.{h,cpp}` (model; `init()` loads data, `compute()` runs the sweep), `precompute.cpp` is still the monolith (own copy of everything, has `main`; `urban` includes it) until the Dev writes a driver for the split files — never link it with `ckd.cpp`/`greenhouse.cpp`.
- `compute/urban/` — urban heat model, just started: `main.cpp` holds the cell/per-type data structures only.
- `compute/grid/` — circuit-simulation prototype (Python), unrelated to greenhouse.
- `interface/greenhouse/` — `src/greenhouse_wasm.cpp` (C ABI: decodes and bilinearly interpolates `final_result.bin`; no solver in the browser), `build.sh` (needs Emscripten), `greenhouse.ts` (binding, `GRID` = range of the table), `mock.ts` (stand-in). Output lands in the gitignored `public/wasm/greenhouse/`; the table is copied to `public/data/greenhouse/final_result.bin` (committed).
- `app/page.tsx` landing page; `app/simulations/greenhouse/page.tsx` the whole simulation page (a client component) with `use-greenhouse.ts` loading the data. `components/`: `simulation.tsx` compound layout (`Simulation.Heading/Main/Sidebar/Footer`), `chart.tsx` (uPlot), `variable-plot.tsx` (pick-the-variables scatter plot), `slider.tsx`, `tabs.tsx`, `use-tour.tsx` (`useTour` hook + `<TourView tour={tour} />`: guided walkthrough, slides give markdown title/content, a `region()` returning viewport `{x:[min,max], y:[min,max]}` and an optional `effect()`; the window has a slide dropdown; size limits are constants at the top of the file), `markdown.tsx` (small Markdown renderer with KaTeX math, used by the tour).
- `workpad/` — gitignored scratch for throwaway experiments, per project (`workpad/greenhouse/`). Local only: the precompute audit (`AUDIT.md`) and the from-scratch pipeline (`HOWTO.md`) live there.

## Conventions

- Design tokens live in `DESIGN.md` and `app/globals.css`. Default Tailwind hue palettes are removed; use `primary` (green), `red`, `blue`, `brown`, `yellow` (100–900) and `slate` for neutrals. Prefer green over red for UI emphasis.
- Prettier config is in `.prettierrc.json` (with the Tailwind plugin). Package manager is pnpm.
- C++ is C++20; build with `g++ --std=c++20 -I compute/greenhouse ... compute/greenhouse/Faddeeva.cc` (see `.vscode/tasks.json`). Run `precompute` from `compute/greenhouse/`, since it uses relative paths.
- Never commit HITRAN credentials (`config.json` is gitignored, though older copies are in history).
- A page's code lives in its `page.tsx`. Do not hoist it into sibling files (no barrel pages) unless there is real reuse or need; genuinely general-purpose pieces go in `components/` and the page references them.
- `SIMULATIONS.md` lists each simulation with its code (folder name) and file locations; add a row when a project is created.
- `LOGS.md` holds the progress logs (newest first, per simulation, plus General). At the end of every iteration add one short, concise log line there, tagged `[Experiment|Production]` (workpad/theory vs. code that reached production code, even if later removed) and `[Dev|Claude]` (who did it). Omit a tag when unknown; never guess.
- Split hybrid work into its smallest steps in `LOGS.md`: when Dev and Claude (or Experiment and Production) both contributed, write one log line per step, each with its own tags, in the order they happened. Record the middle of the iteration, not just the end goal. Example: `[Production] [Dev]` Dev wrote the solver, then `[Experiment] [Claude]` Claude validated it in the workpad, then `[Production] [Claude]` Claude fixed a bug found by that validation. Never merge such steps into one line with a combined or guessed tag.
- Every turn, in this order: (1) before doing the requested task, detect what the Dev changed since the last log (`git status`/`git diff`, `git log` for new commits, file modification times against the latest `LOGS.md` entries, new files in `workpad/`) and write those changes to `LOGS.md` tagged `[Dev]`, with `[Experiment]` or `[Production]` only when it is evident; (2) do the task; (3) log what the turn did, tagged `[Claude]`, split into steps per the hybrid rule above. Log only when code was written, run and/or tested (failed experiments included); never log questions, explanations or diagnoses that changed or ran nothing. Skip a step when nothing like that happened.
- Every single time you write a log line, put it under the right heading in `LOGS.md`: the simulation's own section (`## greenhouse`, `## urban`, `## grid`) whenever the work touches that simulation's files or behaviour (its `page.tsx`, text, data, compute, interface, or a shared component edited for it); `## General` only for shared components and tooling, docs and process that serve no single simulation. Check the heading before writing; a line in the wrong section is a mistake to correct.
- `LOGS.md` is an append-only ledger of all operations. Add new lines (newest first, at the top of their section) and never edit, reorder or delete existing lines, except to correct an earlier error; make such a correction as a new line that says what it corrects, or fix the line in place only if it is plainly a typo or false, and say so in a new line.
- Keep the Status section below current: update it at the end of every iteration of work.

## Status (greenhouse)

Precomputation, interface and UI are wired end to end and working: the table has been generated (`public/data/greenhouse/final_result.bin`), the WASM module is built, and the page runs on the real data.

- **Precompute (`compute/greenhouse/greenhouse.cpp`)**: run by the user (7 threads, one per CH₄ value; CO₂ 420–800 ppm in 19 ppm steps × CH₄ 1.0–4.0 ppm in 0.5 ppm steps, stopped at |E|² < 1e-7). Output verified 2026-10-28: 95,256 bytes, all finite, 177.5–291.3 K, no unwritten points, surface temperature strictly increasing in both gases (+1.95 K for CO₂ 420→800 ppm, +0.75 K for CH₄ 1→4 ppm). Weak spot: the top slab (k=79) is noisy (second differences up to 0.6 K along CO₂ and 1.4 K along CH₄); all other layers are smooth (≤0.03 K).
- **Stop tolerance** (`mag` = |E|²): ground and troposphere error ≈ 1.4·√mag K (1e-4 → 0.01 K); the upper atmosphere converges slower (1e-4 → up to ~1.3 K, 1e-6 → ~0.3 K, 1e-7 → ~0.09 K). Current stop is 1e-7.
- **Interface**: the WASM module decodes and validates the table and interpolates bilinearly. Built with Emscripten 6.0.13 (`em++`, installed in `~/emsdk`, sourced from `~/.bashrc`); verified in Node against the real file (exact at nodes, correct mid-cell and clamping) and in the browser (no stand-in banner, no console errors). `loadGreenhouse()` fetches `/data/greenhouse/final_result.bin`.
- **To finish**: commit `public/data/greenhouse/final_result.bin`; consider converging the top slab better or hiding/smoothing it in the UI.
- **Known model limits** (see the local audit): clear sky; no water-vapour continuum or far-infrared; the CKD g-quadrature under-absorbs in optically thin layers (CO₂ above ~50 km, stratospheric H₂O); slab heights are anchored at the upper edge (`LAYER_ANCHOR = 1`); warming with the anchored baseline is about 2 K per CO₂ doubling, about 0.4 K per CH₄ doubling.
