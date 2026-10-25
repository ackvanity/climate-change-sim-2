// Browser-side binding for the WASM solver built by interface/greenhouse/build.sh.
// Call from a client component or, preferably, a Web Worker: solving blocks the calling thread.

interface GreenhouseModule {
  HEAPF64: Float64Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _gh_init(): number;
  _gh_num_layers(): number;
  _gh_solve(co2Ppm: number, ch4Ppm: number, outT: number, capacity: number): number;
}

export interface Greenhouse {
  /** Equilibrium temperatures in K: 80 atmospheric layers (lowest first), then the surface. */
  solve(co2Ppm: number, ch4Ppm: number): Float64Array;
}

let instance: Promise<Greenhouse> | undefined;

export function loadGreenhouse(): Promise<Greenhouse> {
  instance ??= init();
  return instance;
}

async function init(): Promise<Greenhouse> {
  // Built into public/wasm/greenhouse by interface/greenhouse/build.sh; kept out of the bundler's module graph on purpose.
  const url = '/wasm/greenhouse/greenhouse.js';
  const { default: createGreenhouse } = (await import(/* webpackIgnore: true */ url)) as {
    default: () => Promise<GreenhouseModule>;
  };
  const m = await createGreenhouse();

  if (m._gh_init() !== 0) throw new Error('Greenhouse WASM failed to initialize');
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
