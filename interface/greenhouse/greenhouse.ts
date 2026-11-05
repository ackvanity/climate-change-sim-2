// Browser-side binding for the WASM table decoder built by interface/greenhouse/build.sh.
// On launch it fetches the precomputed table (compute/greenhouse/INTERFACE.md), hands the bytes to WASM, and from then
// on solve() is an interpolated lookup: cheap enough to call on every slider move, no Web Worker needed.

interface GreenhouseModule {
  HEAPF64: Float64Array;
  HEAPU8: Uint8Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _gh_init(bytes: number, size: number): number;
  _gh_num_layers(): number;
  _gh_table_bytes(): number;
  _gh_domain(out: number): void;
  _gh_solve(
    co2Ppm: number,
    ch4Ppm: number,
    outT: number,
    capacity: number
  ): number;
}

export interface GreenhouseDomain {
  /** Range [min, max] in ppm covered by the precomputed table. Inputs outside it are clamped to its edge. */
  co2Ppm: readonly [number, number];
  ch4Ppm: readonly [number, number];
}

export interface Greenhouse {
  /** Equilibrium temperatures in K: 80 atmospheric layers (lowest first), then the surface. */
  solve(co2Ppm: number, ch4Ppm: number): Float64Array;
  /** Range the data covers. Absent on the stand-in model, which has no such limit. */
  domain?: GreenhouseDomain;
}

/** Number of atmospheric slabs the solver returns before the surface value. */
export const NUM_LAYERS = 80;
/** Thickness of each slab in km (`h` in compute/greenhouse/greenhouse.h). */
export const LAYER_HEIGHT_KM = 1;
/**
 * Where slab i's temperature sits inside its slab, as a fraction of the slab thickness above its bottom (0 = bottom
 * edge, 0.5 = centre, 1 = top edge). The current precompute anchors slab i to the AFGL temperature at z = i+1 km (the
 * top edge), so its baseline reproduces AFGL when plotted at 1, 2, ... km. Change to 0.5 if the precompute is changed
 * to slab-centre values (see compute/greenhouse/INTERFACE.md).
 */
export const LAYER_ANCHOR = 1;
/** Altitude in km at which each slab's temperature applies, lowest first. */
export const layerAltitudesKm: readonly number[] = Array.from(
  { length: NUM_LAYERS },
  (_, i) => (i + LAYER_ANCHOR) * LAYER_HEIGHT_KM
);

/**
 * Range and spacing of the precomputed table in ppm. Must agree with compute/greenhouse/INTERFACE.md and the constants
 * at the top of src/greenhouse_wasm.cpp. The WASM module also reports the range at runtime as `Greenhouse.domain`.
 */
export const GRID = {
  co2Ppm: { min: 420, max: 800, step: 19 },
  ch4Ppm: { min: 1.0, max: 4.0, step: 0.5 },
} as const;

/** URL of the precomputed table: copy compute/greenhouse/precompute_bin/final_result.bin to public/data/greenhouse/. */
export const GREENHOUSE_DATA_URL = '/data/greenhouse/final_result.bin';

export interface MacroState {
  co2Ppm: number;
  ch4Ppm: number;
  /** Unweighted mean of the atmospheric slab temperatures in K. */
  meanAtmosphereK: number;
  surfaceK: number;
}

/** Splits a `solve()` result into the per-layer profile and its summary properties. */
export function summarize(
  co2Ppm: number,
  ch4Ppm: number,
  T: Float64Array
): MacroState {
  let sum = 0;
  for (let i = 0; i < NUM_LAYERS; i++) sum += T[i];
  return {
    co2Ppm,
    ch4Ppm,
    meanAtmosphereK: sum / NUM_LAYERS,
    surfaceK: T[NUM_LAYERS],
  };
}

/** True when (co2Ppm, ch4Ppm) lies inside the range the data covers (always true for a model without a `domain`). */
export function isInDomain(
  g: Greenhouse,
  co2Ppm: number,
  ch4Ppm: number
): boolean {
  const d = g.domain;
  return (
    !d ||
    (co2Ppm >= d.co2Ppm[0] &&
      co2Ppm <= d.co2Ppm[1] &&
      ch4Ppm >= d.ch4Ppm[0] &&
      ch4Ppm <= d.ch4Ppm[1])
  );
}

let instance: Promise<Greenhouse> | undefined;

/** Loads the WASM module and the table once; later calls share the result. Rejects if either is missing or invalid. */
export function loadGreenhouse(): Promise<Greenhouse> {
  instance ??= init();
  return instance;
}

async function init(): Promise<Greenhouse> {
  // Built into public/wasm/greenhouse by interface/greenhouse/build.sh; kept out of the bundler's module graph on purpose.
  const url = '/wasm/greenhouse/greenhouse.js';
  const { default: createGreenhouse } = (await import(
    /* webpackIgnore: true */ url
  )) as {
    default: () => Promise<GreenhouseModule>;
  };
  const m = await createGreenhouse();

  const response = await fetch(GREENHOUSE_DATA_URL);
  if (!response.ok)
    throw new Error(
      `Could not fetch ${GREENHOUSE_DATA_URL} (HTTP ${response.status})`
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== m._gh_table_bytes())
    throw new Error(
      `${GREENHOUSE_DATA_URL} is ${bytes.byteLength} bytes, expected ${m._gh_table_bytes()}`
    );

  const dataPtr = m._malloc(bytes.byteLength);
  try {
    // HEAPU8 is re-read after the allocation because memory growth replaces the underlying buffer.
    m.HEAPU8.set(bytes, dataPtr);
    const code = m._gh_init(dataPtr, bytes.byteLength);
    if (code !== 0) throw new Error(`gh_init failed with code ${code}`);
  } finally {
    m._free(dataPtr);
  }

  const layers = m._gh_num_layers();
  const domain = readDomain(m);

  return {
    domain,
    solve(co2Ppm, ch4Ppm) {
      const ptr = m._malloc(layers * Float64Array.BYTES_PER_ELEMENT);
      try {
        const n = m._gh_solve(co2Ppm, ch4Ppm, ptr, layers);
        if (n < 0) throw new Error(`gh_solve failed with code ${n}`);
        const start = ptr / Float64Array.BYTES_PER_ELEMENT;
        return m.HEAPF64.slice(start, start + n);
      } finally {
        m._free(ptr);
      }
    },
  };
}

function readDomain(m: GreenhouseModule): GreenhouseDomain {
  const ptr = m._malloc(4 * Float64Array.BYTES_PER_ELEMENT);
  try {
    m._gh_domain(ptr);
    const s = ptr / Float64Array.BYTES_PER_ELEMENT;
    const [co2Min, co2Max, ch4Min, ch4Max] = m.HEAPF64.slice(s, s + 4);
    return { co2Ppm: [co2Min, co2Max], ch4Ppm: [ch4Min, ch4Max] };
  } finally {
    m._free(ptr);
  }
}
