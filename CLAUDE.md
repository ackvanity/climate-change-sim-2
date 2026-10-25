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

- `compute/greenhouse/` — HITRAN line data → correlated-k tables (`precompute.cpp`, ~4 h run) → radiative-equilibrium solver (L-BFGS-B). `export_data.py` fetches HITRAN. `precompute_bin/` holds the generated binary tables. `greenhouse.cpp` is the older copy; `precompute.cpp` supersedes it.
- `compute/grid/` — circuit-simulation prototype (Python), unrelated to greenhouse.
- `interface/greenhouse/` — `src/greenhouse_wasm.cpp` (C ABI), `build.sh` (needs Emscripten), `greenhouse.ts` (binding). Output lands in the gitignored `public/wasm/greenhouse/`.
- `app/page.tsx` landing page; `app/simulations/greenhouse/page.tsx` the simulation page (shell only); `components/simulation.tsx` compound layout component (`Simulation.Heading/Main/Sidebar/Footer`).

## Conventions

- Design tokens live in `DESIGN.md` and `app/globals.css`. Default Tailwind hue palettes are removed; use `primary` (green), `red`, `blue`, `brown`, `yellow` (100–900) and `slate` for neutrals. Prefer green over red for UI emphasis.
- Prettier config is in `.prettierrc.json` (with the Tailwind plugin). Package manager is pnpm.
- C++ is C++20; build with `g++ --std=c++20 -I compute/greenhouse ... compute/greenhouse/Faddeeva.cc` (see `.vscode/tasks.json`). Run `precompute` from `compute/greenhouse/`, since it uses relative paths.
- Never commit HITRAN credentials (`config.json` is gitignored, though older copies are in history).

## Status

Solver (`Greenhouse::solve_state`) is unfinished: it ignores its inputs and returns `{}`. The simulation page has no controls or plots yet.
