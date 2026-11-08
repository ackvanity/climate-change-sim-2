# Logs

Short progress logs, newest first, grouped by simulation (codes in `SIMULATIONS.md`). One line per log.

Format: `- YYYY-MM-DD — [Type] [Source] — what changed`

Tags (either may be absent when unknown):

- **Type**: `Experiment` = done in the workpad or purely theoretical; `Production` = coded into the production code (`compute/`, `interface/`, `app/`, `components/`), even if later removed.
- **Source**: `Dev` = the developer; `Claude` = the coding assistant.

## General

- 2026-11-02 — [Claude] — Correction: the greenhouse-specific lines below the `greenhouse` heading were first logged under General by mistake; moved 14 of them to `## greenhouse` in their original order (text unchanged). Rule added to `CLAUDE.md`: always log under the simulation's own section.
- 2026-11-02 — [Production] [Claude] — Renamed "step" to "slide" across the tour code: `use-tour.tsx` (`TourStep` → `TourSlide`, `Tour.step` → `Tour.slide`, `useTour(slides)`, `slidesRef`, comments, aria-label "Jump to slide") and the `CLAUDE.md` description. Older log lines keep "step" (ledger). Checked: `tsc` passes, dropdown and highlight work in the browser, no console errors.
- 2026-11-02 — [Experiment] [Claude] — Full review pass in the browser and with `tsc`: types pass; header "Continue Walkthrough" opens the tour only when its inner `<span>` is clicked, not the `<button>` itself (padding area, keyboard Enter/Space) — bug found, not fixed.
- 2026-11-02 — [Production] [Claude] — Restyled the tour window like the rest of the site (square corners, slate-100 body, green header, sliding-fill buttons, slate/primary progress bar); Markdown code blocks use slate-200. Checked in the browser.
- 2026-11-02 — [Production] [Claude] — `use-tour.tsx`: window opens on the left when the default bottom-right spot would cover the highlight (until dragged).
- 2026-11-02 — [Production] [Claude] — `use-tour.tsx`: added a step dropdown (`Tour.titles`, plain-text titles) in place of the step counter.
- 2026-11-02 — [Claude] — Fixed logging so Claude only logs codebase changes
- 2026-11-02 — [Production] [Claude] — Added LaTeX to `components/markdown.tsx` (KaTeX: `$x^2$` inline, `$$…$$` display, price-safe rules), so `useTour` titles and content support it; added the `katex` dependency.
- 2026-11-02 — [Experiment] [Claude] — Checked LaTeX in the browser with a throwaway page (removed): inline, display, nested in bold and in the title render; "$5 and $10" stays text.
- 2026-11-02 — [Production] [Dev] — `SIMULATIONS.md`: reformatted the tables and renamed "Circuit Grid" to "Electric Grid".
- 2026-11-02 — [Production] [Claude] — Added `components/use-tour.tsx` (`useTour` hook + `TourView`/`regionOf`: step walkthrough with highlight region, per-step effect, draggable/resizable window capped at 50% of the viewport, Esc to close keeping the position) and `components/markdown.tsx` (small safe Markdown renderer).
- 2026-11-02 — [Experiment] [Claude] — Checked the tour in the browser with a throwaway page (removed): highlight sits on a chart marker, Esc then reopen keeps the step, drag and resize work and clamp to 50%.
- 2026-11-02 — [Production] [Claude] — Fixed `Chart.getScreenCoordinates` (it ignored `vertical`, so the axes were swapped on vertical charts) and added the optional `axis` argument for the secondary Y scale.
- 2026-11-02 — [Claude] — `CLAUDE.md`: added the per-turn rule (log Dev changes first, do the task, then log the turn) and made `LOGS.md` an append-only ledger.
- 2026-11-02 — [Claude] — `CLAUDE.md`: added the rule to split hybrid work into its smallest tagged steps.
- 2026-11-02 — [Dev] — Committed `3fb9af8` "E2E integration of greenhouse simulation and better logging" (includes the `LOGS.md`/`SIMULATIONS.md` files).
- 2026-11-02 — [Claude] — Added `LOGS.md` and `SIMULATIONS.md`; moved the progress log out of `CLAUDE.md`; `CLAUDE.md` now covers the `urban` project.

## greenhouse

- 2026-11-04 — [Production] [Claude] — Docs now describe the split architecture: new "Compute architecture" table in `README.md` (config / ckd / greenhouse / transitional `precompute.cpp`), pipeline text, `SIMULATIONS.md` rows for `ckd.{h,cpp}`, `greenhouse.h`, `precompute.cpp`, and `INTERFACE.md` (grid constants now in `compute_stride`). Prettier run on the two tables.
- 2026-11-04 — [Experiment] [Claude] — Checked the downstream code after the split: rebuilt `greenhouse_wasm.cpp` with `em++` into the job's temp dir (builds; same size as the deployed `.wasm`), `tsc --noEmit` passes, `final_result.bin` unchanged (95,256 bytes). Fixed my earlier doc edits to match that `precompute.cpp` stays the monolith (README build command, `CLAUDE.md` layout, `INTERFACE.md`).
- 2026-11-04 — [Production] [Claude] — Pointed the greenhouse docs and interface comments at the new files (`README.md`, `SIMULATIONS.md`, `CLAUDE.md`, `INTERFACE.md`, `interface/greenhouse/README.md`, `greenhouse_wasm.cpp`, `greenhouse.ts`); the WASM build includes no `compute/` code, so it needed no `GREENHOUSE_AS_LIBRARY` change. Thin `precompute.cpp` not written yet: write blocked, waiting for the Dev.
- 2026-11-04 — [Production] [Dev] — Removed the `extern` from the variable definitions in `ckd.cpp` and `greenhouse.cpp` (link fix); edited `compute/urban/main.cpp`.
- 2026-11-04 — [Experiment] [Claude] — Compiled the Dev's split (`ckd.cpp`, `greenhouse.cpp`, `ckd.h`, `greenhouse.h`) and diffed it against `precompute.cpp`: each `.cpp` compiles alone, but the headers have no include guards and define globals/functions (link fails with duplicate `CKD::result_*`), and `compute_stride` still calls `compute_atmosphere(0, 0, T, true)`, which now throws. Bugs found, not fixed.
- 2026-11-04 — [Production] [Dev] — Split `precompute.cpp` into `ckd.{h,cpp}` and `greenhouse.{h,cpp}` (uncommitted); `Greenhouse::init()` no longer runs the sweep, new `Greenhouse::compute()`; `compute_atmosphere` gained `tol`, `min_dt`, `verbose` and `reset_T()` replaces its reset mode; `precompute.cpp` itself only got the `tol`/`min_dt`/`compute()` edits.
- 2026-11-02 — [Production] [Dev] — `simulation.tsx`: `Simulation.Heading` takes an optional `tour` and shows "Currently at slide N out of M" plus a "Continue Walkthrough" button; `greenhouse/page.tsx` passes it and has the reflowed tour text.
- 2026-11-02 — [Production] [Claude] — Reformatted the greenhouse tour text: each paragraph is now separated by a blank line (they used to merge into one) and hand-wrapped at 100 columns, formulas on their own lines. Checked in the browser: paragraph counts match the source (e.g. 3 in step 1, 9 in step 4), no formula errors or console errors; Prettier and `tsc` pass.
- 2026-11-02 — [Production] [Claude] — Copy-edited the greenhouse tour text after reading all steps: typos and grammar ("becomes", "afterward", "look at", repeated "most"/"atmosphere"), trailing spaces, indentation, stray blank lines, " -- " → " — ", title case; US spelling kept. Checked in the browser: all 11 steps render, no leftover markup, no console errors; Prettier and `tsc` pass.
- 2026-11-02 — [Experiment] [Claude] — Re-checked the tour in the browser after the Dev's rewrite of steps 1, 4 and 5: 11 steps, formulas render without errors, italics render, highlights present, no console errors; `tsc` passes.
- 2026-11-02 — [Production] [Dev] — `greenhouse/page.tsx`: rewrote the intro, troposphere (dry vs moist lapse rate) and stratosphere texts.
- 2026-11-02 — [Production] [Claude] — Fixed remaining typos in the greenhouse tour text ("absorb" → "absorbs", "11-20km" → "11–20 km", "0-12 km" → "0–12 km").
- 2026-11-02 — [Experiment] [Claude] — Re-ran the greenhouse tour in the browser after the Dev's text/step changes: all 11 steps place their highlight, switch tab and axes; the CO₂ and CH₄ steps move the sliders to 800 / 4.0 ppm; no console errors; `tsc` passes.
- 2026-11-02 — [Production] [Dev] — `greenhouse/page.tsx`: CH₄ now starts at 1.0 ppm (the baseline); fixed the ozone (ultraviolet) explanation, the adiabatic derivation (`(f+2)/2`) and the 6.5 K/km unit; reordered the steps so "Resetting" is last; the CO₂ and CH₄ steps now move the sliders.
- 2026-11-02 — [Production] [Claude] — Fixed clear typos and punctuation in the greenhouse tour text (`atmopshere`, `Stratospehere`, `cliamte`, `mechane`, missing full stop, "to and away the" → "toward and away from the", comma splice, "50" → "50 km"); wording otherwise untouched.
- 2026-11-02 — [Experiment] [Claude] — Stepped through the real greenhouse page in the browser: all 11 steps switch tab, set the axes and place the highlight; dropdown jumps work; no console errors. Checked the explainers' claims against `final_result.bin` (lapse rate 6.5 K/km, isothermal 11–20 km, upper layers cool 5–16 K for 420→800 ppm, surface +1.95 K).
- 2026-11-02 — [Production] [Claude] — Greenhouse tour wiring: step `region`/`effect` functions per the Dev's comments (profile area, 0–12 / 12–50 / 50–80 km bands, CO₂/CH₄ sliders, clear button, tab and axes switching); `Tabs` and `VariablePlot` got controlled `value`/`axes` props, `Slider` and `VariablePlot` got refs; `getGraphBoundingRect` now returns `NaN`s before the plot exists instead of throwing.
- 2026-11-02 — [Production] [Dev] — `greenhouse/page.tsx`: rendered `<TourView>`, wrote the step texts and region comments; `chart.tsx`: added `getGraphBoundingRect` to `ChartRef`.
- 2026-11-02 — [Production] [Dev] — `greenhouse/page.tsx`: wired `useTour` with 11 steps (text only, no `region` or `effect` yet) and a `tour.start()` effect.
- 2026-11-02 — [Production] [Dev] — `components/chart.tsx`: added a `ref` exposing `getScreenCoordinates(x, y)` (data point to viewport pixels); `greenhouse/page.tsx`: reworded the macro plot caption.
- 2026-10-28 — Table verified and copied to `public/data/greenhouse/`; Emscripten installed; `build.sh` switched to `em++` (`emcc` failed to link C++ `new`/`delete`); WASM built and checked in Node and the browser.
- 2026-10-27 — Grid changed to 21 × 7 (19 ppm / 0.5 ppm steps); WASM constants, `GRID`, `INTERFACE.md` and the interface README follow; decoder test and `tsc` pass.
- 2026-10-27 — Grid-size study (1-D balance, linear interpolation): about 7 nodes per gas give 0.01 K error, far below the solver's ~0.01 K ground error; grid left unchanged at the time.
- 2026-10-27 — UI: sliders follow the table range (`GRID`); macro plot became `components/variable-plot.tsx`; `greenhouse-view.tsx` merged into `page.tsx`.
- 2026-10-27 — Interface glue: WASM decode + interpolate, `INTERFACE.md`, binding with `GRID`, native C++ test; tolerance study for the stop rule.
- 2026-10-27 — Precompute review: gravity added to the pressure step, grid-loop bugs fixed; audit found the CKD quadrature and pressure issues.
- 2026-10-26 — Warming validated: about 1.4 K per CO₂ doubling with the 1-D balance, about 2 K with the relaxation model.

## urban

- 2026-11-08 — [Experiment] [Claude] — Tested the ported stack: the WASM solver on 500 × 500 with five material blocks (100 s step) runs 7 simulated days finite (282.4–289.6 K) at 1.38 ms/step, types survive stepping, and the page ran past day 4 at 144 steps/s, 1.36 ms/step, with no stop; hover readout confirms the map (Water stays warm at night). Found on the way: `loadUrban()` created a 1 × 1 grid the new solver rejects (fixed to 3 × 3).
- 2026-11-08 — [Production] [Claude] — Ported `interface/urban` and the page to the rewritten solver: `urban_wasm.cpp` now uses `getCellTypes()`, `syncCellTypes()` (lazy: only before a step after an edit or a `dt` change), `propogateChanges()` and a 3 × 3 minimum; `build.sh` compiles the solver with `-ffast-math` and the wrapper without it (fast-math folds `std::isfinite`, which would blind the divergence check); `urban.ts` adds `CELL_SIZE_M`, the per-material evapotranspiration flag and the 70,560-byte table; the page shows cell size and step from those constants; README and `CLAUDE.md` updated.
- 2026-11-08 — [Production] [Claude] — Merged the Dev's `feat/simulation-2` (`7045aff`…`889c8bb`) into `feat/urban-frontend` and snapshotted the Dev's newer working-tree `compute.cpp`/`urban.h` and table (ET lookup fixes, `uint8_t` cell types) as a separate commit; unchanged by Claude.
- 2026-11-08 — [Production] [Dev] — Working tree after `889c8bb`: Priestley–Taylor lookup table applied as `dT *= fact` with the `dT > 0` guard and `1 − min(1, x)`, `cell_type_t` as `uint8_t`; `urban.ts` edited for the 70,560-byte table and `TIME_STEP_S = 100`; `-ffast-math` in `build.sh`.
- 2026-11-08 — [Production] [Dev] — Committed `7045aff`, `1836dcc`, `9142396`, `889c8bb`: benchmarking with nanobench, a structure-of-arrays solver (precomputed conductances, edge-aware loops, `dt` baked into the heat capacity), a 5 K heat-transfer table (re-run), evapotranspiration, `compare.cpp`.
- 2026-11-07 — [Experiment] [Claude] — Re-tested after the merge: the WASM solver on 500 × 500 with five material blocks runs 7 simulated days finite (287.3–291.7 K, 2.40 ms/step), and the page ran past day 4 at 24 steps/s with no stop. The divergence is gone. The drift toward the earlier steady-state estimates (forest 291.7, asphalt 290.2, concrete 287.3 K) shows vegetation hotter than concrete; the daily swing stays under 1 K.
- 2026-11-07 — [Production] [Claude] — Merged the Dev's `feat/simulation-2` (`3fc0578`) into `feat/urban-frontend`; took the Dev's `compute.cpp`/`urban.h` over my snapshot (identical to their commit) and rebuilt the WASM module, which needed no wrapper changes.
- 2026-11-07 — [Production] [Dev] — Committed `3fc0578` "Testing fix 1 to divergence": lateral conduction scale `NU` 15000 → 500, concrete heat capacity 1e6, new `Simulation::propogateChanges()` (copies the current slot into the others), `testing.cpp` driver.
- 2026-11-07 — [Experiment] [Claude] — Checked the page in the browser (webpack dev server from the worktree: Turbopack rejects the symlinked `node_modules`): painting, play/pause at 24 steps/s on 500 × 500, colour maps, hover readout, history with free axes and two Y axes. Found and fixed three page bugs on the way: an update loop (`materials` was a new array on every reset), canvases sized from non-state, and a history that never refreshed (same array passed to `setState`). The run still diverges around hour 2 (the Dev is debugging it): playback stops and a banner explains.
- 2026-11-07 — [Production] [Claude] — Added `app/simulations/urban/` (`page.tsx`, `use-urban.ts`): left sidebar with the CO₂/CH₄ sliders, run controls (play, step, speed, latitude, grid size), the brush tool and the heatmap colour settings; main area with three tabs (grid editor, temperature map, history). Added an Urban card to the landing page.
- 2026-11-07 — [Production] [Claude] — Shared components for the history tab: `variable-plot.tsx` gets `mode="line"` and grouped selector options (`PlotVariable.group`); `chart.tsx` turns non-finite values into gaps.
- 2026-11-07 — [Production] [Claude] — Added `interface/urban/`: `src/urban_wasm.cpp` (C ABI over `compute.cpp`: create, step, paint into every slot, stats, RGBA rendering), `build.sh` (needs a `<bits/stdc++.h>` shim and `-Duint=unsigned` for Emscripten), `urban.ts` binding, `README.md`; copied the table to `public/data/urban/`.
- 2026-11-07 — [Experiment] [Claude] — Benchmarked the solver at 500 × 500 with the real table: native 3.1 ms/step (`-O2`, ~80 M cell updates/s), WASM in Node 2.57 ms/step, stats 0.63 ms and render 0.73 ms per call. Painting survives steps in both slots. The run diverges within the first 6 simulated hours (found, not diagnosed).
- 2026-11-07 — [Production] [Dev] — Edited `compute.cpp` and `urban.h` (uncommitted): `~Simulation() = default`, include guard fixed, move constructor removed, thermal-mass divisor now `heat_capacity * GRID_HEIGHT`, concrete heat capacity 1e5.
- 2026-11-07 — [Production] [Dev] — Committed `e034016` and `89e5478`: threaded table builder (`precompute.cpp`, infrared-only table, `k_sensible` moved into the sim), `Simulation` class with premade materials, per-material `k_surface_factor`, table pointer for JS, `heat_transfer_rate.bin`.
- 2026-10-31 — [Production] — `compute/urban/main.cpp` started: 500 × 500 grid, per-type cell data (albedo, conductivity, heat capacity), empty `main`.

## grid

- No logs yet.
