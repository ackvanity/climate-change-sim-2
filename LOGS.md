# Logs

Short progress logs, newest first, grouped by simulation (codes in `SIMULATIONS.md`). One line per log.

Format: `- YYYY-MM-DD — [Type] [Source] — what changed`

Tags (either may be absent when unknown):

- **Type**: `Experiment` = done in the workpad or purely theoretical; `Production` = coded into the production code (`compute/`, `interface/`, `app/`, `components/`), even if later removed.
- **Source**: `Dev` = the developer; `Claude` = the coding assistant.

## General

- 2026-11-02 — [Claude] — `CLAUDE.md`: added the per-turn rule (log Dev changes first, do the task, then log the turn) and made `LOGS.md` an append-only ledger.
- 2026-11-02 — [Claude] — `CLAUDE.md`: added the rule to split hybrid work into its smallest tagged steps.
- 2026-11-02 — [Dev] — Committed `3fb9af8` "E2E integration of greenhouse simulation and better logging" (includes the `LOGS.md`/`SIMULATIONS.md` files).
- 2026-11-02 — [Claude] — Added `LOGS.md` and `SIMULATIONS.md`; moved the progress log out of `CLAUDE.md`; `CLAUDE.md` now covers the `urban` project.

## greenhouse

- 2026-10-28 — Table verified and copied to `public/data/greenhouse/`; Emscripten installed; `build.sh` switched to `em++` (`emcc` failed to link C++ `new`/`delete`); WASM built and checked in Node and the browser.
- 2026-10-27 — Grid changed to 21 × 7 (19 ppm / 0.5 ppm steps); WASM constants, `GRID`, `INTERFACE.md` and the interface README follow; decoder test and `tsc` pass.
- 2026-10-27 — Grid-size study (1-D balance, linear interpolation): about 7 nodes per gas give 0.01 K error, far below the solver's ~0.01 K ground error; grid left unchanged at the time.
- 2026-10-27 — UI: sliders follow the table range (`GRID`); macro plot became `components/variable-plot.tsx`; `greenhouse-view.tsx` merged into `page.tsx`.
- 2026-10-27 — Interface glue: WASM decode + interpolate, `INTERFACE.md`, binding with `GRID`, native C++ test; tolerance study for the stop rule.
- 2026-10-27 — Precompute review: gravity added to the pressure step, grid-loop bugs fixed; audit found the CKD quadrature and pressure issues.
- 2026-10-26 — Warming validated: about 1.4 K per CO₂ doubling with the 1-D balance, about 2 K with the relaxation model.

## urban

- 2026-10-31 — [Production] — `compute/urban/main.cpp` started: 500 × 500 grid, per-type cell data (albedo, conductivity, heat capacity), empty `main`.

## grid

- No logs yet.
