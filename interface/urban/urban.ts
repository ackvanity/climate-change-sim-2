// Browser-side binding for the urban cell-grid solver built by interface/urban/build.sh (compute/urban/compute.cpp plus
// src/urban_wasm.cpp). On launch it fetches the precomputed heat-transfer table (compute/urban/precompute_bin_urban),
// hands the bytes to WASM, and then drives one simulation at a time. The solver itself runs in the browser.

interface UrbanModule {
  HEAPF64: Float64Array;
  HEAPU8: Uint8Array;
  UTF8ToString(ptr: number): string;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _ur_table_ptr(): number;
  _ur_table_bytes(): number;
  _ur_create(
    rows: number,
    cols: number,
    colatitude: number,
    co2Ppm: number,
    ch4Ppm: number,
    dt: number,
    S0: number
  ): number;
  _ur_destroy(): void;
  _ur_step(n: number): void;
  _ur_set_params(dt: number, S0: number, colatitude: number): void;
  _ur_set_gases(co2Ppm: number, ch4Ppm: number): void;
  _ur_set_hour(hour: number): void;
  _ur_hour(): number;
  _ur_type_count(): number;
  _ur_type_name(i: number): number;
  _ur_type_color(i: number): number;
  _ur_type_hot(i: number, out: number): void;
  _ur_cell(row: number, col: number, out: number): number;
  _ur_paint(
    row: number,
    col: number,
    radius: number,
    material: number,
    shape: number
  ): void;
  _ur_fill(material: number): void;
  _ur_fill_temperature(kelvin: number): void;
  _ur_load_types(ptr: number): void;
  _ur_read_types(ptr: number): void;
  _ur_stats(out: number): void;
  _ur_render(mode: number, lut: number, lo: number, hi: number): number;
}

/** URL of the precomputed table: copy compute/urban/precompute_bin_urban/heat_transfer_rate.bin to public/data/urban/. */
export const URBAN_DATA_URL = '/data/urban/heat_transfer_rate.bin';

/** Range and spacing of the table in ppm (`compute_section` in compute/urban/precompute.cpp). Inputs outside it extrapolate. */
export const GRID = {
  co2Ppm: { min: 420, max: 800, step: 19 },
  ch4Ppm: { min: 1.0, max: 4.0, step: 0.5 },
} as const;

/** `7 × 21 × 600` little-endian doubles. */
const TABLE_BYTES = 7 * 21 * 600 * 8;
/** Solar constant in W/m², as the solver expects. */
export const SOLAR_CONSTANT = 1361;
/** Time step of the simulation in seconds. */
export const TIME_STEP_S = 600;
/**
 * Latitude at which the mean daily sunlight equals the global mean the heat-transfer table was calibrated for
 * (S0/π · cos φ = S0/4 → φ ≈ 38°, mid-latitudes like the US Standard Atmosphere).
 */
export const CALIBRATION_LATITUDE_DEG = 38.3;
/** Temperature every cell starts at, in K. */
export const INITIAL_TEMPERATURE_K = 288;

/** A cell material as defined by the solver's premade set. */
export interface Material {
  /** Material id as stored in the grid. */
  id: number;
  name: string;
  /** Any CSS colour. */
  color: string;
  albedo: number;
  kLateral: number;
  kSurfaceFactor: number;
  heatCapacity: number;
}

export interface GroupStats {
  /** Temperatures in K; `NaN` when the group has no finite cells. */
  min: number;
  max: number;
  mean: number;
  /** Number of cells counted. */
  count: number;
}

export interface Stats {
  /** Per material, indexed like `Urban.materials`. */
  materials: GroupStats[];
  /** The whole grid. */
  all: GroupStats;
  /** Cells whose temperature is not a finite number (the run has diverged if this is above 0). */
  nonFinite: number;
}

export type BrushShape = 'round' | 'square';

export interface UrbanOptions {
  rows: number;
  cols: number;
  /** Degrees; 90 is the pole, 0 the equator. */
  latitudeDeg: number;
  co2Ppm: number;
  ch4Ppm: number;
}

const colatitude = (latitudeDeg: number) =>
  ((90 - latitudeDeg) * Math.PI) / 180;

export class Urban {
  rows = 0;
  cols = 0;
  /** Simulated hours since the last reset (the clock of the solver wraps every 24 h; this does not). */
  elapsedHours = 0;
  materials: Material[] = [];

  private dt = TIME_STEP_S;
  private S0 = SOLAR_CONSTANT;
  private colat = colatitude(CALIBRATION_LATITUDE_DEG);
  private readonly statsPtr: number;
  private readonly cellPtr: number;
  private readonly lutPtr: number;
  private typesPtr = 0;

  constructor(private readonly m: UrbanModule) {
    this.statsPtr = m._malloc(8 * (m._ur_type_count() + 1) * 4 + 8);
    this.cellPtr = m._malloc(16);
    this.lutPtr = m._malloc(256 * 4);
  }

  /** Creates a fresh rows × cols grid of the first material at the initial temperature, replacing the old one. */
  reset(o: UrbanOptions): void {
    const m = this.m;
    this.colat = colatitude(o.latitudeDeg);
    const slots = m._ur_create(
      o.rows,
      o.cols,
      this.colat,
      o.co2Ppm,
      o.ch4Ppm,
      this.dt,
      this.S0
    );
    if (slots < 0) throw new Error(`Invalid grid size ${o.rows}×${o.cols}`);
    this.rows = o.rows;
    this.cols = o.cols;
    this.elapsedHours = 0;
    if (this.typesPtr) m._free(this.typesPtr);
    this.typesPtr = m._malloc(o.rows * o.cols);
    // The material set is fixed by the solver; reading it once keeps `materials` referentially stable for React.
    if (this.materials.length === 0) this.materials = this.readMaterials();
  }

  private readMaterials(): Material[] {
    const m = this.m;
    const out: Material[] = [];
    const hot = m._malloc(32);
    for (let id = 0; id < m._ur_type_count(); id++) {
      const name = m.UTF8ToString(m._ur_type_name(id));
      if (!name) continue;
      m._ur_type_hot(id, hot);
      const h = new Float64Array(m.HEAPF64.buffer, hot, 4);
      out.push({
        id,
        name,
        color: m.UTF8ToString(m._ur_type_color(id)),
        albedo: h[0],
        kLateral: h[1],
        kSurfaceFactor: h[2],
        heatCapacity: h[3],
      });
    }
    m._free(hot);
    return out;
  }

  /** Advances the simulation by `n` steps of `TIME_STEP_S`. */
  step(n = 1): void {
    this.m._ur_step(n);
    this.elapsedHours += (n * this.dt) / 3600;
  }

  /** Hour of day (0 to 24) on the solver's clock. */
  get hourOfDay(): number {
    return this.m._ur_hour();
  }
  setHourOfDay(hour: number): void {
    this.m._ur_set_hour(hour);
  }

  setLatitude(latitudeDeg: number): void {
    this.colat = colatitude(latitudeDeg);
    this.m._ur_set_params(this.dt, this.S0, this.colat);
  }

  setGases(co2Ppm: number, ch4Ppm: number): void {
    this.m._ur_set_gases(co2Ppm, ch4Ppm);
  }

  // ---- editing -------------------------------------------------------------------------------------------------

  /** Paints a disc or square of the given radius (in cells) around (row, col); clipped to the grid. */
  paint(
    row: number,
    col: number,
    radius: number,
    material: number,
    shape: BrushShape = 'round'
  ): void {
    this.m._ur_paint(row, col, radius, material, shape === 'round' ? 0 : 1);
  }
  fillMaterial(material: number): void {
    this.m._ur_fill(material);
  }
  fillTemperature(kelvin: number): void {
    this.m._ur_fill_temperature(kelvin);
  }
  /** Replaces the whole material map (`rows * cols` ids, row-major). */
  loadTypes(types: Uint8Array): void {
    if (types.length !== this.rows * this.cols)
      throw new Error('Material map has the wrong size');
    this.m.HEAPU8.set(types, this.typesPtr);
    this.m._ur_load_types(this.typesPtr);
  }
  readTypes(): Uint8Array {
    this.m._ur_read_types(this.typesPtr);
    return this.m.HEAPU8.slice(
      this.typesPtr,
      this.typesPtr + this.rows * this.cols
    );
  }

  // ---- reading -------------------------------------------------------------------------------------------------

  /** Temperature (K) and material id of one cell, or `null` outside the grid. */
  cell(
    row: number,
    col: number
  ): { temperatureK: number; material: number } | null {
    if (!this.m._ur_cell(row, col, this.cellPtr)) return null;
    const v = new Float64Array(this.m.HEAPF64.buffer, this.cellPtr, 2);
    return { temperatureK: v[0], material: v[1] };
  }

  stats(): Stats {
    const m = this.m;
    m._ur_stats(this.statsPtr);
    const n = m._ur_type_count();
    const f = new Float64Array(
      m.HEAPF64.buffer,
      this.statsPtr,
      (n + 1) * 4 + 1
    );
    const group = (g: number): GroupStats => ({
      min: f[g * 4],
      max: f[g * 4 + 1],
      mean: f[g * 4 + 2],
      count: f[g * 4 + 3],
    });
    return {
      materials: this.materials.map((mat) => group(mat.id)),
      all: group(n),
      nonFinite: f[(n + 1) * 4],
    };
  }

  // ---- rendering -----------------------------------------------------------------------------------------------

  /**
   * RGBA image (`cols × rows`) of the material map. `palette` holds one RGBA colour per material id (4 bytes each,
   * `NUM_CELL_TYPES` entries). The result views WASM memory: use it before the next call into the module.
   */
  renderMaterials(palette: Uint8Array): Uint8ClampedArray {
    this.m.HEAPU8.set(palette, this.lutPtr);
    return this.image(this.m._ur_render(0, this.lutPtr, 0, 0));
  }

  /**
   * RGBA image of the temperature, colours taken from a 256-entry `lut` (1024 bytes) spread over [lo, hi] K. Cells
   * with a non-finite temperature come out magenta. Same lifetime as `renderMaterials`.
   */
  renderTemperature(
    lut: Uint8Array,
    lo: number,
    hi: number
  ): Uint8ClampedArray {
    this.m.HEAPU8.set(lut, this.lutPtr);
    return this.image(this.m._ur_render(1, this.lutPtr, lo, hi));
  }

  private image(ptr: number): Uint8ClampedArray {
    return new Uint8ClampedArray(
      this.m.HEAPU8.buffer,
      ptr,
      this.rows * this.cols * 4
    );
  }
}

/** Number of material ids the solver can hold (including undefined ones). */
export const NUM_MATERIAL_IDS = 10;

let instance: Promise<Urban> | undefined;

/** Loads the WASM module and the table once; later calls share the result. Rejects if either is missing or invalid. */
export function loadUrban(): Promise<Urban> {
  instance ??= init();
  return instance;
}

async function init(): Promise<Urban> {
  // Built into public/wasm/urban by interface/urban/build.sh; kept out of the bundler's module graph on purpose.
  const url = '/wasm/urban/urban.js';
  const { default: createUrban } = (await import(
    /* webpackIgnore: true */ url
  )) as { default: () => Promise<UrbanModule> };
  const m = await createUrban();

  const res = await fetch(URBAN_DATA_URL);
  if (!res.ok) throw new Error(`Cannot load ${URBAN_DATA_URL} (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== TABLE_BYTES || m._ur_table_bytes() !== TABLE_BYTES)
    throw new Error(
      `Heat-transfer table has ${bytes.length} bytes, expected ${TABLE_BYTES}`
    );
  const values = new Float64Array(
    bytes.buffer,
    bytes.byteOffset,
    TABLE_BYTES / 8
  );
  for (let i = 0; i < values.length; i++)
    if (!Number.isFinite(values[i]))
      throw new Error('Heat-transfer table contains a non-finite value');
  m.HEAPU8.set(bytes, m._ur_table_ptr());

  const urban = new Urban(m);
  // A tiny grid, so that the material list can be read before the page chooses its own size.
  urban.reset({
    rows: 1,
    cols: 1,
    latitudeDeg: CALIBRATION_LATITUDE_DEG,
    co2Ppm: GRID.co2Ppm.min,
    ch4Ppm: GRID.ch4Ppm.min,
  });
  return urban;
}
