# Greenhouse precomputation: output files and how `interface/` reads them

`Greenhouse::init()` in `precompute.cpp` solves the model on a grid of CO₂ and CH₄ amounts and writes one file the
browser needs: **`precompute_bin/final_result.bin`**. The other `.bin` files in `precompute_bin/` are inputs to the
offline computation and are never shipped to the browser.

Run the precomputation from this folder (`compute/greenhouse/`): it uses relative paths.

## `final_result.bin` (the only file the UI needs)

| Property     | Value                                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| Size         | `7 × 21 × 81 × 8 = 95,256` bytes                                                |
| Element type | IEEE-754 float64, **little-endian** (also the byte order of WebAssembly memory) |
| Header       | none: validate by size and value range                                          |
| Layout       | `[ch4_idx][co2_idx][k]`, C order                                                |

Index of a value (in doubles): `((ch4_idx * 21 + co2_idx) * 81) + k`. One grid point is 81 consecutive doubles
(`idx = co2_idx + 21 * ch4_idx`, byte offset `idx * 648`).

| Axis | Index range     | Value                                                               |
| ---- | --------------- | ------------------------------------------------------------------- |
| CO₂  | `co2_idx` 0..20 | `420 + 19 · co2_idx` ppm (420 … 800)                                |
| CH₄  | `ch4_idx` 0..6  | `1.0 + 0.5 · ch4_idx` ppm (1.0 … 4.0)                               |
| `k`  | 0..79           | temperature in K of atmospheric slab `k` (1 km thick, lowest first) |
| `k`  | 80              | surface (ground) temperature in K                                   |

Meaning of the numbers:

- Each point is the equilibrium of the model (Greenhouse namespace in `precompute.cpp`) at that gas amount, found by
  relaxation (stopped at |E|² < 1e-7) warm-started along each CO₂ row.
- The model is anchored to AFGL through `inject_flux` (`fit_params()`): at the baseline (330 ppm CO₂, 1.93 ppm CH₄) it
  reproduces the AFGL profile exactly, so **slab `k` corresponds to altitude `k + 1` km** (AFGL temperature at the
  slab's upper edge), the surface to 0 km. Plot slab `k` at `(k + 1)` km. `interface/greenhouse/greenhouse.ts`
  encodes this in `LAYER_ANCHOR` (1 = upper edge, 0.5 = centre); change it together with the precompute if the
  convention changes.
- Clear-sky model: no clouds. Only differences from the baseline carry meaning as warming.
- A point whose relaxation hit the iteration cap is still written; it prints `WARNING: iteration stopped prematurely`
  on stderr. Check the log of the run.
- The table is only valid inside the axes above. The CO₂ and CH₄ transmission tables behind it are clamped outside
  420–840 ppm and 1.0–4.0 ppm.

### Parsing

C++ (what `interface/greenhouse/src/greenhouse_wasm.cpp` does):

```cpp
std::vector<double> table(7 * 21 * 81);
std::memcpy(table.data(), bytes, 7 * 21 * 81 * sizeof(double)); // same byte order, no conversion
const double *T = &table[(ch4_idx * 21 + co2_idx) * 81];         // T[0..79] slabs, T[80] surface
```

TypeScript / browser (little-endian hosts, which is every browser target):

```ts
const t = new Float64Array(await (await fetch(url)).arrayBuffer()); // length 11,907 = 7*21*81
const at = (ch4Idx: number, co2Idx: number, k: number) =>
  t[(ch4Idx * 21 + co2Idx) * 81 + k];
```

Python:

```python
import numpy as np
T = np.fromfile("precompute_bin/final_result.bin", dtype="<f8").reshape(7, 21, 81)  # [ch4_idx, co2_idx, k]
```

### Interpolation (done in WASM)

Bilinear in (CO₂ ppm, CH₄ ppm) on the uniform grid. The response is smooth (about logarithmic in CO₂, about square-root
in CH₄), so the interpolation error is far below the model's own uncertainty (an estimated 1e-3 K for CO₂ and 1e-2 K for CH₄ at most; it is exact
at grid nodes). Inputs outside the grid are **clamped** to the nearest edge; the binding exposes `domain` and
`isInDomain()` so the UI can say so.

### Installing it for the web app

```bash
mkdir -p public/data/greenhouse
cp compute/greenhouse/precompute_bin/final_result.bin public/data/greenhouse/final_result.bin   # repo root
./interface/greenhouse/build.sh            # only needed once, or when the table format changes (requires Emscripten)
```

The file is served at `/data/greenhouse/final_result.bin`. It is about 95 KB: commit it so deployments work (unlike
`public/wasm/`, which is a gitignored build output). Next.js sends `public/` files with `Cache-Control: public,
max-age=0`, so a browser refresh picks up a new table. If the file is missing, wrong in size or contains invalid
temperatures, `loadGreenhouse()` rejects and the page keeps using the stand-in model.

### Sanity check after a run

```bash
python3 - <<'EOF'
import numpy as np
T = np.fromfile("compute/greenhouse/precompute_bin/final_result.bin", dtype="<f8")
assert T.size == 7 * 21 * 81, T.size
T = T.reshape(7, 21, 81)
print("min/max K:", T.min(), T.max(), "| surface at (CO2 420, CH4 1.0):", T[0, 0, 80], "| (CO2 800, CH4 4.0):", T[6, 20, 80])
assert np.isfinite(T).all() and (T > 150).all() and (T < 450).all()
EOF
```

Surface temperature must rise with both CO₂ (along `co2_idx`) and CH₄ (along `ch4_idx`).

### Changing the grid

The axes are constants in three places that must agree: `Greenhouse::init()` (loop bounds, `420 + 19 * co2_idx`,
`1.0 + 0.5 * ch4_idx`, the `result` array size), the top of `interface/greenhouse/src/greenhouse_wasm.cpp`
(`CO2_*`, `CH4_*`) and `GRID` in `interface/greenhouse/greenhouse.ts` (it sets the slider ranges in
`app/simulations/greenhouse/page.tsx`). Rebuild the WASM afterwards. At runtime the binding also reads the range from
the WASM (`Greenhouse.domain`).

## Other files in `precompute_bin/` (offline only, do not copy to `public/`)

| File                                       | Layout                                                                                                                                                                                                                                                                                                                              | Written by                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `<GAS>_lines.bin` (CO2, H2O, O3, CH4, N2O) | `uint64` line count, then that many 48-byte records of 6 float64 (`nu` cm⁻¹, `sw`, `gamma_air`, `gamma_self`, `elower`, `n_air`)                                                                                                                                                                                                    | `export_data.py` (HITRAN)        |
| `<GAS>_Q.bin`                              | 400 float64: partition function at T = 0 … 399 K                                                                                                                                                                                                                                                                                    | `export_data.py`                 |
| `<GAS>_transmission.bin`                   | correlated-k tables: array of `Binning` indexed `T_idx + 15·(P_idx + 18·vmr_idx)`, each `Binning` = 16 bins × 16 g-points of float64 `k` (cm² per molecule). Axes: T = `180 + 10·T_idx` K; P = `2^-P_idx` atm; vmr per gas as in `CKD::compute_ckd()`. CO₂, CH₄, O₃, N₂O: 11 vmr nodes (6,082,560 bytes); H₂O: 16 (8,847,360 bytes) | `CKD::compute_ckd()` (about 4 h) |
| `final_result.bin`                         | see above                                                                                                                                                                                                                                                                                                                           | `Greenhouse::init()`             |
