# List of improvements to existing projects

Ideas and known issues, sorted per simulation. Each entry says what is wrong or missing, why it matters, and a possible
approach.

## greenhouse

## urban

### Model atmospheric warming (the city cannot warm its own air)

The air above every cell is a fixed `T_ATMOSPHERE` = 281.7 K (`compute/urban/urban.h`), the same everywhere, by day and by
night. The sensible-heat term `k_surface * (T_ATMOSPHERE - T)` always pulls the ground towards that constant.

Consequences:

- Only a **surface** heat island is simulated. The canopy-layer (air) heat island, where the city heats the air above it and
  that warm air keeps the surroundings warm, is missing; this is the effect usually meant by "urban heat island".
- The **night-time** heat island is far too weak (asphalt about 2 K warmer than grass at dawn; real cities 5–10 K), because
  nothing traps the heat the city stored by day. Street-canyon geometry (lower sky-view factor, trapped infrared, extra
  absorption of sunlight) and anthropogenic heat are also absent.
- The air has no daily cycle, so the sensible flux is too strong at noon and has the wrong size at night.
- **Greenhouse gases barely matter**: CO₂ 420 → 800 ppm warms the ground only about 0.17 K (the greenhouse page shows about
  2 K), since only the direct change in downwelling infrared (+3.5 W/m²) reaches the surface; the air itself never warms.

Possible approach:

1. Give each cell (or a coarser grid) an air temperature `T_air` with its own heat capacity (a mixed layer of a few hundred
   metres, `rho c_p h`).
2. Couple it to the ground through the existing `k_surface` term (equal and opposite flux), to its neighbours by lateral
   mixing / advection (a wind vector would make the heat plume drift downwind), and to a background temperature by
   relaxation (exchange with the free atmosphere).
3. Let the background temperature follow the greenhouse table (`public/data/greenhouse/final_result.bin`, first slab) for
   the current CO₂ and CH₄, so the gas sliders warm the air as well as the ground, and give it a daily cycle.
4. Optional, for the night-time heat island: a sky-view factor per material (buildings) that reduces the infrared loss.

Keep the explicit stability limit in mind: the air layer adds a fast mode if its heat capacity is small.

### Semi-implicit heat losses (larger, more accurate time steps)

`update()` in `compute/urban/compute.cpp` is fully explicit: the heat lost to the air (`k_surface`), the infrared emission
(table slope) and the lateral conduction are all evaluated at the temperature at the start of the step. This sets both
the stability limit and most of the time-step error.

- **Stability**: mixed maps oscillate at dt = 3600 s and blow up at 4320–5400 s (a thin grass cell next to water or
  forest is the weakest case). The page used 100 s and now uses 1200 s (`TIME_STEP_S`), which is safe (`workpad/urban/dt-sweep/`).
- **Accuracy**: the surface responds a step late and overshoots, so daily swings come out too large (about 0.35 K per
  extra 1000 s of dt for pavement; 0.45 K at 1200 s).
- **Sunlight averaging alone does not fix it**: using the exact mean sunlight over [t, t + dt] instead of the value at t
  cut the error about 3× for forest and water but made grass and mixed maps worse (rms 0.12 → 0.20 K at 1200 s), because
  the early sunlight was partly cancelling the late response (`workpad/urban/dt-light/`).

Possible approach:

1. Linearize the losses around the current temperature: per cell, `G = k_surface + dIR/dT + sum of the four k_lateral`
   (the infrared slope comes from the heat-transfer table; for evapotranspiring cells include the Priestley–Taylor factor).
2. Solve for the new temperature with the cell's own losses taken at the end of the step:
   `T_new = T + (F(T) * dt) / (C + G * dt)`, i.e. divide by `C/dt + G` instead of `C/dt` (neighbors still enter at their
   old temperatures, which keeps it a single pass).
3. Then switch the sunlight to the step average, which should now reduce the error instead of increasing it.
4. Re-run both workpad sweeps to find the new stable and accurate dt, then raise `TIME_STEP_S` in
   `interface/urban/urban.ts` (fewer steps per simulated hour, so higher speeds on large grids and phones).

## grid
