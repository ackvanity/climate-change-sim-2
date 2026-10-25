# interface/greenhouse

The boundary between the offline C++ precomputation (`compute/greenhouse/`) and the UI (`app/simulations/greenhouse/`).
The UI never touches C++ or the raw tables; it only calls the typed binding in `greenhouse.ts`.

```
compute/greenhouse/  --(include)-->  src/greenhouse_wasm.cpp  --(emcc, build.sh)-->  public/wasm/greenhouse/greenhouse.{js,wasm,data}
                                                                                              |
                                                          greenhouse.ts  <--(dynamic import)--+
```

## Files

- `src/greenhouse_wasm.cpp` — C ABI over the solver in `compute/greenhouse/precompute.cpp`.
- `build.sh` — Emscripten build. Bundles `precompute_bin/` and the AFGL table into `greenhouse.data`.
- `greenhouse.ts` — `loadGreenhouse()` returns `{ solve(co2Ppm, ch4Ppm) }`.

## C ABI

| Function | Description |
|---|---|
| `int gh_init()` | Loads the transmission tables, builds Planck and AFGL data. `0` on success. |
| `int gh_num_layers()` | Number of doubles `gh_solve` writes (81). |
| `int gh_solve(co2_ppm, ch4_ppm, double* out_T, int capacity)` | Writes the temperature profile [K], lowest layer first, surface last. Returns the count written, or a negative error code. |

## Build

Requires the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (`emcc`). It is not installed in the current dev environment, so the WASM build has not been run yet.

```bash
./interface/greenhouse/build.sh
```

## Known gaps

- `Greenhouse::solve_state` returns `{}` and ignores its CO₂/CH₄ arguments (the solver is work in progress), so `gh_solve` currently returns 0 values.
- `greenhouse.data` is about 46 MB because the C++ `Species` constructor also loads the raw `*_lines.bin` files, which the solve does not use. Splitting the constructor would drop roughly 15 MB.
- The solve is synchronous and CPU-heavy (finite-difference gradients over 81 variables); run it in a Web Worker.
