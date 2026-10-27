// Browser-side binding for the WASM solver built by interface/greenhouse/build.sh.
// Call from a client component or, preferably, a Web Worker: solving blocks the calling thread.

interface GreenhouseModule {
  HEAPF64: Float64Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _gh_init(): number;
  _gh_num_layers(): number;
  _gh_solve(
    co2Ppm: number,
    ch4Ppm: number,
    outT: number,
    capacity: number
  ): number;
}

export interface Greenhouse {
  /** Equilibrium temperatures in K: 80 atmospheric layers (lowest first), then the surface. */
  solve(co2Ppm: number, ch4Ppm: number): Float64Array;
}

/** Number of atmospheric slabs the solver returns before the surface value. */
export const NUM_LAYERS = 80;
/** Thickness of each slab in km (`h` in compute/greenhouse/precompute.cpp). */
export const LAYER_HEIGHT_KM = 1;
/** Mid-point altitude of each slab in km, lowest first. */
export const layerAltitudesKm: readonly number[] = Array.from(
  { length: NUM_LAYERS },
  (_, i) => (i + 0.5) * LAYER_HEIGHT_KM
);

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

let instance: Promise<Greenhouse> | undefined;

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

  if (m._gh_init() !== 0)
    throw new Error('Greenhouse WASM failed to initialize');
  const layers = m._gh_num_layers();

  return {
    solve(co2Ppm, ch4Ppm) {
      const ptr = m._malloc(layers * Float64Array.BYTES_PER_ELEMENT);
      try {
        const n = m._gh_solve(co2Ppm, ch4Ppm, ptr, layers);
        if (n < 0) throw new Error(`gh_solve failed with code ${n}`);
        const start = ptr / Float64Array.BYTES_PER_ELEMENT;
        // HEAPF64 is re-read here because memory growth replaces the underlying buffer.
        return m.HEAPF64.slice(start, start + n);
      } finally {
        m._free(ptr);
      }
    },
  };
}
