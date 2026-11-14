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

## grid
