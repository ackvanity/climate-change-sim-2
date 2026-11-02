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

- 2026-10-31 — [Production] — `compute/urban/main.cpp` started: 500 × 500 grid, per-type cell data (albedo, conductivity, heat capacity), empty `main`.

## grid

- No logs yet.
