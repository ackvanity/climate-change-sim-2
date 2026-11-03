# interface/greenhouse

The boundary between the offline C++ precomputation (`compute/greenhouse/`) and the UI (`app/simulations/greenhouse/`).
The UI never touches C++ or the raw tables; it only calls the typed binding in `greenhouse.ts`.

The browser does not solve anything. The offline run writes a table of equilibrium temperature profiles on a CO₂ × CH₄
grid; on launch the binding fetches it, a small WASM module decodes it, and `solve()` is a bilinear lookup.

```
compute/greenhouse/precompute.cpp --(Greenhouse::init, offline)--> precompute_bin/final_result.bin
                                                                              | cp (see compute/greenhouse/INTERFACE.md)
                                                                              v
                                               public/data/greenhouse/final_result.bin --(fetch on launch)--+
                                                                                                           |
src/greenhouse_wasm.cpp --(emcc, build.sh)--> public/wasm/greenhouse/greenhouse.{js,wasm} <--(dynamic import)-- greenhouse.ts
```

The file format, axes, parsing recipes and the install step are specified in
[`compute/greenhouse/INTERFACE.md`](../../compute/greenhouse/INTERFACE.md). That document is the contract.

## Files

- `src/greenhouse_wasm.cpp` — C ABI: validates and decodes the table, interpolates it. Includes nothing from `compute/`.
- `build.sh` — Emscripten build of that one file (a few KB of WASM; no tables are compiled in).
- `greenhouse.ts` — `loadGreenhouse()` fetches the table, hands it to WASM and returns `{ solve(co2Ppm, ch4Ppm), domain }`, plus layer constants (`NUM_LAYERS`, `layerAltitudesKm`, `LAYER_ANCHOR`), `summarize()` for the macro properties and `isInDomain()`.
- `mock.ts` — `mockGreenhouse`, a parametrised stand-in with the same `solve()` contract. The UI falls back to it while the table or the WASM is missing or invalid. It is not the radiative-equilibrium physics.

## C ABI

| Function                                                      | Description                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `int gh_table_bytes()`                                        | Size in bytes of `final_result.bin` (95,256).                                                                                                                                                                                                        |
| `int gh_init(const uint8_t* bytes, int size)`                 | Decodes and validates the table (copies it). `0` ok, `-1` null, `-2` wrong size, `-3` non-finite or implausible temperatures.                                                                                                                        |
| `int gh_num_layers()`                                         | Number of doubles `gh_solve` writes (81).                                                                                                                                                                                                            |
| `void gh_domain(double* out4)`                                | Writes `{co2_min, co2_max, ch4_min, ch4_max}` in ppm.                                                                                                                                                                                                |
| `int gh_solve(co2_ppm, ch4_ppm, double* out_T, int capacity)` | Writes the temperature profile [K], lowest layer first, surface last. Inputs outside the grid are clamped to its edge. Returns the count written, or a negative error code (`-1` not initialised, `-2` capacity/null output, `-3` non-finite input). |

## Build and install

Requires the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (`emcc`); it is not installed in the current dev environment, so the WASM build has not been run here. The C++ was tested natively.

```bash
./interface/greenhouse/build.sh                                   # only when src/greenhouse_wasm.cpp changes
mkdir -p public/data/greenhouse
cp compute/greenhouse/precompute_bin/final_result.bin public/data/greenhouse/
```

## Behaviour and limits

- **Domain:** the table covers CO₂ 420–800 ppm and CH₄ 1.0–4.0 ppm. Outside it `solve()` returns the nearest edge. The sliders in `app/simulations/greenhouse/page.tsx` follow `GRID` (this table's range) and the profile chart's baseline is its lowest corner, so the UI never leaves the table. `domain` and `isInDomain()` remain available for code that takes arbitrary input.
- **Altitudes:** slab `k` is plotted at `(k + 1)` km (`LAYER_ANCHOR = 1`), matching how the precompute anchors the baseline to AFGL.
- **Cost:** `solve()` is O(81) and synchronous; no Web Worker is needed.
- **Fallback:** if the table cannot be fetched or fails validation, `loadGreenhouse()` rejects and `useGreenhouse` keeps the mock.
