'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { Simulation } from '@/components/simulation';
import { Slider } from '@/components/slider';
import { Tabs } from '@/components/tabs';
import { DataExport } from '@/components/data-export';
import type { ExportColumn } from '@/components/use-export';
import { TourView, regionOf, useTour } from '@/components/use-tour';
import {
  VariablePlot,
  type PlotAxes,
  type PlotVariable,
} from '@/components/variable-plot';
import {
  CALIBRATION_LATITUDE_DEG,
  GRID,
  INITIAL_TEMPERATURE_K,
  NUM_MATERIAL_IDS,
  SMOOTH_TIME_STEP_S,
  TIME_STEP_S,
  type BrushShape,
  type Material,
  type Stats,
  type Urban,
} from '@/interface/urban/urban';
import { useUrban } from './use-urban';

// ---- tuning ----------------------------------------------------------------------------------------------------------

const GRID_SIZES = [100, 250, 500];
const DEFAULT_SIZE = 500;
/** The history keeps only this many simulated hours (5 days); older samples are dropped. */
const HISTORY_HOURS = 120;
/** Wall-clock time one animation frame may spend stepping the solver; the speed setting is capped by it. */
const FRAME_BUDGET_MS = 12;
/** How often the sidebar readout is allowed to re-render. */
const READOUT_MS = 200;
/** A grid temperature above this (K) or below 0 K means the run has blown up and playback stops. */
const DIVERGED_K = 1000;
const MAX_BRUSH_RADIUS = 40;
const SPEED = { min: 0.25, max: 48, step: 0.25 }; // simulated hours per real second
/**
 * Adaptive time step, with hysteresis because changing it rebuilds the solver's per-cell data: below
 * `SMOOTH_BELOW` h/s the solver switches to `SMOOTH_TIME_STEP_S`, and only goes back to `TIME_STEP_S` once the speed
 * reaches `FAST_FROM` h/s. In between, whichever step is active is kept, so dragging the slider does not flip it.
 */
const SMOOTH_BELOW = 1;
const FAST_FROM = 4;
const KELVIN_AT_0C = 273.15;
/** Tour demos run on a small grid so a few simulated days pass in seconds. */
const DEMO_SIZE = 100;
const DEMO_SPEED = 24; // simulated hours per real second

// ---- color maps ------------------------------------------------------------------------------------------------------

const COLOR_PRESETS = {
  thermal: {
    label: 'Thermal',
    stops: ['#2c3e91', '#4aa3c7', '#f4e285', '#ee8b3a', '#b3261e'],
  },
  viridis: {
    label: 'Viridis',
    stops: ['#440154', '#3b528b', '#21908c', '#5dc863', '#fde725'],
  },
  diverging: {
    label: 'Blue – white – red',
    stops: ['#3b4cc0', '#dddddd', '#b40426'],
  },
  gray: { label: 'Grayscale', stops: ['#000000', '#ffffff'] },
} as const;
type PresetKey = keyof typeof COLOR_PRESETS | 'custom';
const DEFAULT_CUSTOM = ['#1d4ed8', '#fde68a', '#b91c1c'];

const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** 256 RGBA entries (1024 bytes), blending linearly between evenly spaced color stops. */
function buildLut(stops: readonly string[]): Uint8Array {
  const rgb = stops.map(hexToRgb);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1);
    const k = Math.min(Math.floor(t), rgb.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++)
      lut[4 * i + c] = Math.round(rgb[k][c] * (1 - f) + rgb[k + 1][c] * f);
    lut[4 * i + 3] = 255;
  }
  return lut;
}

/** Any CSS color (the solver's materials use hex and oklch) as RGBA bytes, by letting a canvas parse it. */
function cssToRgba(css: string): [number, number, number, number] {
  const ctx = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  if (!ctx) return [203, 213, 225, 255];
  ctx.fillStyle = '#cbd5e1';
  ctx.fillStyle = css; // an unparsable color leaves the fallback in place
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], 255];
}

/**
 * Palette for the material map (one RGBA per material id) plus CSS swatches. Materials the solver gives the same
 * color would be indistinguishable on the map, so later ones are darkened until they differ.
 */
function materialPalette(materials: Material[]) {
  const rgba = new Uint8Array(NUM_MATERIAL_IDS * 4);
  for (let i = 0; i < NUM_MATERIAL_IDS; i++)
    rgba.set([203, 213, 225, 255], 4 * i);
  const swatch: Record<number, string> = {};
  const seen = new Set<string>();
  for (const m of materials) {
    let [r, g, b] = cssToRgba(m.color);
    for (let tries = 0; seen.has(`${r},${g},${b}`) && tries < 6; tries++) {
      r = Math.round(r * 0.7);
      g = Math.round(g * 0.7);
      b = Math.round(b * 0.7);
    }
    seen.add(`${r},${g},${b}`);
    rgba.set([r, g, b, 255], 4 * m.id);
    swatch[m.id] = `rgb(${r} ${g} ${b})`;
  }
  return { rgba, swatch };
}

// ---- starting layouts ------------------------------------------------------------------------------------------------

type LayoutKind = 'city' | 'river' | 'park' | 'strips' | 'concrete';
const LAYOUTS: Record<LayoutKind, string> = {
  city: 'City with parks',
  river: 'City with river',
  park: 'City with one central park',
  strips: 'One strip of each material',
  concrete: 'All concrete',
};

const hash2 = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Material map (row-major ids) for a few ready-made scenes: street grid, blocks, parks, ponds, a river. */
function makeLayout(
  kind: LayoutKind,
  rows: number,
  cols: number,
  idOf: (name: string) => number
): Uint8Array {
  const asphalt = idOf('asphalt');
  const concrete = idOf('concrete');
  const grass = idOf('grass');
  const forest = idOf('forest');
  const water = idOf('water');
  const out = new Uint8Array(rows * cols).fill(concrete);
  if (kind === 'concrete') return out;
  if (kind === 'strips') {
    // Five equal vertical bands, wide enough that their middles barely feel the neighbors.
    const order = [asphalt, concrete, grass, forest, water];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        out[i * cols + j] = order[Math.min(4, Math.floor((j * 5) / cols))];
    return out;
  }
  const period = Math.max(20, Math.round(Math.min(rows, cols) / 8));
  const road = Math.max(2, Math.round(period / 7));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      let id = concrete;
      if (i % period < road || j % period < road) id = asphalt;
      else {
        const bi = Math.floor(i / period);
        const bj = Math.floor(j / period);
        const h = hash2(bi, bj);
        const d = Math.hypot(i - (bi + 0.5) * period, j - (bj + 0.5) * period);
        if (kind === 'city' && h < 0.2) id = d < period * 0.22 ? forest : grass;
        else if (kind === 'city' && h < 0.26)
          id = d < period * 0.3 ? water : grass;
      }
      if (kind === 'park') {
        // Streets and blocks, with one round park in the middle: forest core, grass ring, a pond to one side.
        const r = Math.hypot(i - rows / 2, j - cols / 2) / Math.min(rows, cols);
        const pond =
          Math.hypot(i - rows * 0.45, j - cols * 0.58) / Math.min(rows, cols);
        if (pond < 0.05) id = water;
        else if (r < 0.1) id = forest;
        else if (r < 0.2) id = grass;
      }
      if (kind === 'river') {
        const center = cols * (0.5 + 0.18 * Math.sin((i / rows) * Math.PI * 3));
        const off = Math.abs(j - center);
        if (off < cols * 0.035) id = water;
        else if (off < cols * 0.055) id = grass;
      }
      out[i * cols + j] = id;
    }
  return out;
}

// ---- history ---------------------------------------------------------------------------------------------------------

/** One recorded moment: `time`, `hour`, `all_*` and `m<id>_*` (avg/min/max) keys. Temperatures in K. */
type Sample = Record<string, number>;
const isTemperatureKey = (k: string) => /_(avg|min|max)$/.test(k);

function sampleOf(urban: Urban, st: Stats): Sample {
  const s: Sample = {
    time: urban.elapsedHours,
    hour: urban.hourOfDay,
    all_avg: st.all.mean,
    all_min: st.all.min,
    all_max: st.all.max,
  };
  urban.materials.forEach((m, i) => {
    const g = st.materials[i];
    s[`m${m.id}_avg`] = g.mean;
    s[`m${m.id}_min`] = g.min;
    s[`m${m.id}_max`] = g.max;
  });
  return s;
}

function divergence(st: Stats): string | null {
  if (st.nonFinite > 0)
    return `${st.nonFinite.toLocaleString()} cells have a non-finite temperature.`;
  if (st.all.max > DIVERGED_K || st.all.min < 0)
    return `Temperatures left the physical range (${st.all.min.toExponential(1)} to ${st.all.max.toExponential(1)} K).`;
  return null;
}

// ---- page ------------------------------------------------------------------------------------------------------------

/** Canvases subscribe to redraw whenever the solver has moved on. */
type Bus = Set<() => void>;

interface Readout {
  elapsedHours: number;
  hourOfDay: number;
  meanK: number;
  stepsPerSecond: number;
  msPerStep: number;
  diverged: string | null;
}

export default function UrbanHeat() {
  const { urban, error } = useUrban();

  return urban ? (
    <UrbanApp urban={urban} />
  ) : (
    <Simulation>
      <Simulation.Heading title="Urban Heat Island" />
      <Simulation.Main>
        <div className="min-w-0 flex-1 p-8">
          {error ? (
            <p role="alert" className="max-w-prose">
              The urban heat solver could not be loaded: {error}. It needs{' '}
              <code>public/wasm/urban/</code> (run{' '}
              <code>interface/urban/build.sh</code>) and{' '}
              <code>public/data/urban/heat_transfer_rate.bin</code>.
            </p>
          ) : (
            <p>Loading the solver…</p>
          )}
        </div>
      </Simulation.Main>
      <Simulation.Footer></Simulation.Footer>
    </Simulation>
  );
}

function UrbanApp({ urban }: { urban: Urban }) {
  // Atmosphere and sun
  const [co2, setCo2] = useState<number>(GRID.co2Ppm.min);
  const [ch4, setCh4] = useState(1.9);
  const [latitude, setLatitude] = useState(
    Math.round(CALIBRATION_LATITUDE_DEG)
  );
  // Run control
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  // Brush
  const [brushMaterial, setBrushMaterial] = useState(1);
  const [radius, setRadius] = useState(6);
  const [shape, setShape] = useState<BrushShape>('round');
  // Heatmap
  const [preset, setPreset] = useState<PresetKey>('thermal');
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);
  const [autoRange, setAutoRange] = useState(true);
  const [fixedRange, setFixedRange] = useState<[number, number]>([270, 320]);
  const [celsius, setCelsius] = useState(false);
  // View
  const [tab, setTab] = useState('editor');
  const [axes, setAxes] = useState<PlotAxes<string>>({
    x: 'time',
    y: 'all_avg',
    y2: '',
  });
  const [readout, setReadout] = useState<Readout>({
    elapsedHours: 0,
    hourOfDay: 0,
    meanK: INITIAL_TEMPERATURE_K,
    stepsPerSecond: 0,
    msPerStep: 0,
    diverged: null,
  });
  const [samples, setSamples] = useState<Sample[]>([]);

  // Mutable state shared with the animation loop and the canvases (changes must not re-render the page every frame).
  const bus = useRef<Bus>(new Set());
  const history = useRef<Sample[]>([]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const settings = useRef({ co2, ch4, latitude });
  settings.current = { co2, ch4, latitude };
  const perf = useRef({ stepsPerSecond: 0, msPerStep: 0 });
  const lastReadout = useRef(0);
  const diverged = useRef<string | null>(null);

  const { rgba: palette, swatch } = useMemo(
    () => materialPalette(urban.materials),
    [urban.materials]
  );
  const idOf = useCallback(
    (name: string) =>
      urban.materials.find((m) => m.name.toLowerCase() === name)?.id ??
      urban.materials[0]?.id ??
      0,
    [urban.materials]
  );

  const notify = useCallback(() => bus.current.forEach((draw) => draw()), []);

  /** Pushes the current solver state to the sidebar (throttled unless forced) and, optionally, to the history. */
  const publish = useCallback(
    (st: Stats, opts: { force?: boolean; record?: boolean } = {}) => {
      if (opts.record) {
        const h = history.current;
        const sample = sampleOf(urban, st);
        h.push(sample);
        const cutoff = sample.time - HISTORY_HOURS;
        let drop = 0;
        while (drop < h.length - 1 && h[drop].time < cutoff) drop++;
        if (drop > 0) history.current = h.slice(drop);
      }
      const now = performance.now();
      if (!opts.force && now - lastReadout.current < READOUT_MS) return;
      lastReadout.current = now;
      setReadout({
        elapsedHours: urban.elapsedHours,
        hourOfDay: urban.hourOfDay,
        meanK: st.all.mean,
        stepsPerSecond: perf.current.stepsPerSecond,
        msPerStep: perf.current.msPerStep,
        diverged: diverged.current,
      });
      setSamples(history.current.slice()); // a new array, or React sees no change
    },
    [urban]
  );

  /** Called after the solver advanced. Returns false when playback must stop (the run diverged). */
  const afterAdvance = useCallback(
    (opts: { force?: boolean } = {}) => {
      const st = urban.stats();
      const bad = divergence(st);
      if (bad) diverged.current = bad;
      publish(st, { record: !bad, force: opts.force || !!bad });
      notify();
      return !bad;
    },
    [urban, publish, notify]
  );

  /** Fresh grid at the chosen size with a ready-made scene. */
  const restart = useCallback(
    (kind: LayoutKind) => {
      const s = settings.current;
      urban.reset({
        rows: size,
        cols: size,
        latitudeDeg: s.latitude,
        co2Ppm: s.co2,
        ch4Ppm: s.ch4,
      });
      urban.loadTypes(makeLayout(kind, size, size, idOf));
      urban.fillTemperature(INITIAL_TEMPERATURE_K);
      history.current = [];
      diverged.current = null;
      perf.current = { stepsPerSecond: 0, msPerStep: 0 };
      afterAdvance({ force: true });
    },
    [urban, size, idOf, afterAdvance]
  );

  /** Scene (and whether to play) for the next restart caused by a grid-size change; tour slides set it. */
  const pendingRestart = useRef<{ kind: LayoutKind; play: boolean }>({
    kind: 'city',
    play: false,
  });
  useEffect(() => {
    const p = pendingRestart.current;
    pendingRestart.current = { kind: 'city', play: false };
    restart(p.kind);
    setPlaying(p.play);
  }, [restart]);

  useEffect(() => urban.setGases(co2, ch4), [urban, co2, ch4]);
  useEffect(() => urban.setLatitude(latitude), [urban, latitude]);
  useEffect(() => {
    if (speed < SMOOTH_BELOW) urban.setTimeStep(SMOOTH_TIME_STEP_S);
    else if (speed >= FAST_FROM) urban.setTimeStep(TIME_STEP_S);
  }, [urban, speed]);

  // The animation loop: step the solver for as much simulated time as the speed asks for, within the frame budget.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let windowStart = last;
    let windowSteps = 0;
    let owed = 0;
    let msPerStep = Math.max(perf.current.msPerStep, 3);
    const frame = (now: number) => {
      owed +=
        ((speedRef.current * 3600) / urban.timeStepS) *
        Math.min((now - last) / 1000, 0.1);
      last = now;
      const want = Math.floor(owed);
      owed -= want;
      const start = performance.now();
      let done = 0;
      while (done < want) {
        const spent = performance.now() - start;
        if (spent >= FRAME_BUDGET_MS) break;
        const n = Math.max(
          1,
          Math.min(
            want - done,
            Math.floor((FRAME_BUDGET_MS - spent) / Math.max(msPerStep, 0.05))
          )
        );
        const t0 = performance.now();
        urban.step(n);
        msPerStep = 0.7 * msPerStep + 0.3 * ((performance.now() - t0) / n);
        done += n;
      }
      windowSteps += done;
      if (now - windowStart >= 500) {
        perf.current = {
          stepsPerSecond: (windowSteps * 1000) / (now - windowStart),
          msPerStep,
        };
        windowStart = now;
        windowSteps = 0;
      }
      if (done > 0 && !afterAdvance()) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, urban, afterAdvance]);

  const stepOnce = () => {
    urban.step(1);
    afterAdvance({ force: true });
  };

  const afterEdit = useCallback(() => {
    publish(urban.stats(), { force: true });
  }, [urban, publish]);

  const stops = useMemo<readonly string[]>(
    () => (preset === 'custom' ? custom : COLOR_PRESETS[preset].stops),
    [preset, custom]
  );
  const lut = useMemo(() => buildLut(stops), [stops]);
  const unit = celsius ? '°C' : 'K';
  const show = useCallback(
    (kelvin: number) => (celsius ? kelvin - KELVIN_AT_0C : kelvin),
    [celsius]
  );

  const variables = useMemo(() => {
    const t = (label: string, group: string): PlotVariable => ({
      label,
      unit,
      decimals: 2,
      group,
    });
    const v: Record<string, PlotVariable> = {
      time: { label: 'Time', unit: 'h', decimals: 1, group: 'Time' },
      hour: { label: 'Hour of day', unit: 'h', decimals: 1, group: 'Time' },
      all_avg: t('Whole grid average', 'Whole grid'),
      all_min: t('Whole grid minimum', 'Whole grid'),
      all_max: t('Whole grid maximum', 'Whole grid'),
    };
    for (const m of urban.materials) {
      v[`m${m.id}_avg`] = t(`${m.name} average`, m.name);
      v[`m${m.id}_min`] = t(`${m.name} minimum`, m.name);
      v[`m${m.id}_max`] = t(`${m.name} maximum`, m.name);
    }
    return v;
  }, [urban.materials, unit]);

  // Every recorded property, in the unit chosen for display.
  const exportColumns = useMemo<ExportColumn<Sample>[]>(
    () =>
      Object.keys(variables).map((k) => ({
        label: variables[k].label,
        unit: variables[k].unit,
        value: (s: Sample) => (isTemperatureKey(k) ? show(s[k]) : s[k]),
      })),
    [variables, show]
  );

  const points = useMemo(
    () =>
      samples.map((s) => {
        const out: Sample = {};
        for (const k in s) out[k] = isTemperatureKey(k) ? show(s[k]) : s[k];
        return out;
      }),
    [samples, show]
  );

  // Elements the tour highlights.
  const brushRef = useRef<HTMLElement>(null);
  const simRef = useRef<HTMLElement>(null);
  const atmoRef = useRef<HTMLElement>(null);
  const heatRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  /** History key of a material's statistic, e.g. `avgOf('asphalt')` → `m0_avg`. */
  const avgOf = (name: string) => `m${idOf(name)}_avg`;
  /** Fresh demo scene at the demo size, playing. A size change restarts through `pendingRestart`. */
  const loadDemo = (kind: LayoutKind) => {
    setSpeed(DEMO_SPEED);
    if (size !== DEMO_SIZE) {
      pendingRestart.current = { kind, play: true };
      setSize(DEMO_SIZE);
    } else {
      restart(kind);
      setPlaying(true);
    }
  };
  /** History tab plotting two materials' averages against time; keeps the current run going. */
  const compare = (y: string, y2: string) => {
    setTab('history');
    setAxes({ x: 'time', y: avgOf(y), y2: avgOf(y2) });
    if (!diverged.current) setPlaying(true);
  };

  const tour = useTour([
    {
      title: `Urban Heat Island`,
      content: `City landscapes are usually warmer than their surroundings, a phenomenon known as
      the urban heat island effect. This is because different materials react differently to
      incoming radiation. Concrete and asphalt tend to retain it more, while plants and water bodies
      let moisture evaporate and dissipate heat more efficiently, meaning they are cooler during the
      day.

      This simulation demonstrates how different city landscapes can cause or mitigate this
      phenomenon.`,
    },
    {
      title: `Painting the Map`,
      content: `The grid editor shows the city layout. Pick a **material** in the Brush panel, set
      its size and shape, then click and drag over the grid to paint.

      "Fill all" covers the whole map with the chosen material. You can use pre-made scenarios in
      the Scene menu.`,
      effect: () => setTab('editor'),
      region: () => regionOf(brushRef.current),
    },
    {
      title: `Running the Simulation`,
      content: `Press **Play** to advance the simulation. You can adjust the speed of the simulation
      and the latitude (which affects how strong the sun's radiation is at that point). Restart
      resets the entire simulation and restores the default city layout.`,
      region: () => regionOf(simRef.current),
    },
    {
      title: `Atmosphere`,
      content: `Greenhouse gases affect how hot the atmosphere, and surface, will be. Drag the CO₂
      and CH₄ sliders and see how the temperatures drift.

      **NOTE**: For a dedicated exploration on how these gases affect atmospheric temperatures,
      refer to the Greenhouse Effect simulation instead.`,
      region: () => regionOf(atmoRef.current),
    },
    {
      title: `Temperature Map`,
      content: `This tab shows a heatmap of the city by temperature. Hover over the map to read the
      value and material under the pointer. Hotter surfaces show warmer colors by default.`,
      effect: () => setTab('heatmap'),
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Color Settings`,
      content: `Configure heatmap and temperature display options here.`,
      effect: () => setTab('heatmap'),
      region: () => regionOf(heatRef.current),
    },
    {
      title: `History`,
      content: `The history plot collects trends of temperature as a function of time. You can use
      it to compare how different materials behave.`,
      effect: () => setTab('history'),
      region: () => regionOf(viewRef.current),
    },

    // 1. Explain why concrete and asphalt swing so much (switch to chart and show the effect)
    // Real-world figures below are commonly cited values; check sources before publishing.
    {
      title: `Surface Heating: Asphalt`,
      content: `To see how materials respond to sunlight, we've loaded a map with one strip of each
      material and plotted the average temperature of asphalt and grass over time. Tick "Use a
      single scale for both Y axes" to compare them on the same scale, and wait for the simulation
      to stabilize before

      Each cell gains heat from sunlight and the atmosphere, and loses heat by emitting infrared
      radiation, by contact with the air and by evaporating water:

      $$C\\,\\frac{dT}{dt} = (1-\\alpha)\\,S + L_{\\downarrow} - \\varepsilon\\sigma T^4 - H - \\lambda E$$

      Here $\\alpha$ is the **albedo**, the fraction of sunlight reflected, and $C$ is the heat
      capacity of the surface. Asphalt has a low albedo of around 0.1, so it absorbs about 90% of
      incoming sunlight. It is also dry, so $\\lambda E = 0$ and all of the absorbed energy goes
      into heating the surface. Furthermore, only the top ~10 cm of pavement heats up and cools down
      within a day, so $C$ is small and the temperature responds quickly to sunlight.`,
      effect: () => {
        loadDemo('strips');
        compare('asphalt', 'grass');
      },
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Surface Heating: Day and Night`,
      content: `The chart now plots asphalt and concrete. Both heat up rapidly after sunrise and
      cool down after sunset, with a daily swing of tens of degrees, much larger than grass or
      water.

      Concrete has a higher albedo (around 0.3), so it absorbs less sunlight and stays cooler during
      the day. This is the principle behind **cool pavements** and **cool roofs**, which use lighter
      surfaces to reflect more sunlight. For example, Los Angeles has tested reflective coatings on
      its streets, reportedly lowering surface temperatures by several degrees. In contrast, sunlit
      asphalt can reach 60–70 °C on summer afternoons, hot enough to cause burns on contact in
      cities such as Phoenix.

      In real cities, the heat island is usually strongest at *night*. Buildings store heat in their
      walls, and narrow streets block the view of the cold sky, so the city releases its heat slowly
      after dark. Hot nights prevent people from recovering from the heat of the day, which
      contributed to the deaths in the 1995 Chicago and 2003 European heatwaves.

      **NOTE**: This simulation does not include buildings, so it mainly shows the daytime heating
      of surfaces.`,
      effect: () => compare('asphalt', 'concrete'),
      region: () => regionOf(viewRef.current),
    },

    // 2. Explain how evapotranspiration works (show difference of forest, water, and grass in multiple slides).
    {
      title: `Evapotranspiration`,
      content: `Plants and wet surfaces have an additional way to lose heat: evaporating water.
      Evaporation from soil and open water, together with transpiration (water released by plants
      through their leaves), is known as **evapotranspiration**.

      Evaporating water requires a large amount of energy, namely the latent heat of vaporization,
      about 2.45 MJ per kg of water. This means that evaporating just 1 mm of water per day removes
      about 28 W/m² on average, and a well-watered field can evaporate 4–6 mm on a summer day,
      removing over 100 W/m².

      The simulation uses the **Priestley–Taylor** model, in which a fraction of the energy
      available at the surface ($R_n - G$) goes into evaporation instead of heating:

      $$\\lambda E = \\alpha_{PT}\\,\\frac{\\Delta}{\\Delta+\\gamma}\\,(R_n - G)$$

      Here $\\Delta$ is the rate at which the saturation vapor pressure increases with temperature,
      $\\gamma$ is the psychrometric constant and $\\alpha_{PT} \\approx 1.26$. Since $\\Delta$
      grows with temperature, hotter surfaces put a larger fraction of their energy into
      evaporation, which limits how hot they can get.`,
      effect: () => compare('grass', 'concrete'),
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Evapotranspiration: Grass`,
      content: `The chart now plots grass and concrete. Grass absorbs roughly as much sunlight as
      concrete (albedo around 0.23), so why does it stay much cooler during the day? This occurs
      because a large part of the absorbed energy evaporates water instead of heating the ground.

      However, this only works while water is available. The simulation assumes that the soil is
      always moist, but during a drought, grass dries out and stops transpiring, so it heats up
      almost like bare ground. This is why irrigation and soil moisture matter as much as the plants
      themselves.`,
      effect: () => compare('grass', 'concrete'),
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Evapotranspiration: Forest`,
      content: `The chart now plots forest and grass. Trees have a lower albedo than grass (around
      0.13), but they still stay cooler. A large tree can transpire hundreds of liters of water per
      day using its deep roots, so it can keep evaporating long after grass has dried out. Trees
      also shade the ground and the people below them, although this is not included in the
      simulation.

      Many cities plant trees for this reason. For example, Medellín's "Green Corridors" turned
      roads and waterways into planted corridors, reportedly lowering temperatures by about 2 °C,
      and Melbourne aims to cover 40% of the city with tree canopy by 2040.`,
      effect: () => compare('forest', 'grass'),
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Evapotranspiration: Water`,
      content: `The chart now plots water and asphalt. Water has the lowest albedo in the simulation
      (around 0.08), yet its temperature barely changes throughout the day. This occurs because
      water has a very high heat capacity (about 4.2 MJ per m³ per kelvin), mixing spreads the heat
      through a deep layer, and its surface is always wet, so it can always evaporate.

      The same heat capacity works in reverse at night: water releases its stored heat slowly, so
      counterintuitively, ponds and rivers can be *warmer* than the surrounding land after dark.

      For example, Seoul removed an elevated highway in 2005 to restore the Cheonggyecheon stream
      beneath it, and the air along the stream was reported to be 3–6 °C cooler than along a nearby
      road.`,
      effect: () => compare('water', 'asphalt'),
      region: () => regionOf(viewRef.current),
    },

    // 3. Show coolness "bleeding" (lateral conduction), again highlight heatmaps and use appropriate presets
    {
      title: `Lateral Conduction`,
      content: `To see how materials affect their neighbors, we've loaded a city with one park in
      the middle (forest, a ring of grass and a pond) and switched to the temperature map. Wait
      until the afternoon, then hover over the concrete right next to the park and compare it to
      concrete further away.

      Heat flows from hot regions to cold regions through the ground, at a rate proportional to the
      temperature difference (Fourier's law, $q = -k\\,\\nabla T$). The hot pavement around the park
      therefore passes some of its heat into the cooler park, so the edge of the park becomes warmer
      than its center, while the pavement next to it becomes slightly cooler than the rest of the
      city.

      **NOTE**: In this simulation, heat only moves through the ground, so this effect only reaches
      one or two cells (10–20 m). In real cities, wind also carries cool air from parks into the
      surrounding streets, often over a distance similar to the width of the park.`,
      effect: () => {
        loadDemo('park');
        setTab('heatmap');
      },
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Lateral Conduction: Park Size`,
      content: `Try painting the same amount of forest as one large block in one area and as many
      small patches in another (pause the simulation and use the Grid editor), then compare them on
      the temperature map.

      A large park has a cool center that the warm streets around it cannot reach. Small parks
      consist mostly of edges, so the surrounding pavement warms them up, but together they cool a
      much larger number of streets. Because of this, cities use both: large parks as places to
      escape the heat, and street trees, green roofs and green schoolyards spread throughout every
      neighborhood. For example, Paris is converting its asphalt schoolyards into "OASIS"
      schoolyards with plants and permeable ground.`,
      effect: () => setTab('heatmap'),
      region: () => regionOf(viewRef.current),
    },
    {
      title: `Real-World Impact`,
      content: `Cities are typically 1–3 °C warmer than the surrounding countryside on average, and
      up to about 10 °C warmer on calm, clear evenings.

      This has a significant impact on health, since heat is one of the deadliest types of weather,
      especially for older people, outdoor workers and people without air conditioning. The heat is
      also distributed unevenly: in many US cities, historically redlined neighborhoods have fewer
      trees and more pavement, and are several degrees hotter than other neighborhoods today. Hotter
      cities also need more air conditioning, whose waste heat and power plant emissions make the
      problem worse, and heat speeds up the formation of ground-level ozone, reducing air quality.

      The solutions are the same ones you can paint in this simulation, namely using lighter
      surfaces, adding more trees and grass, and introducing open bodies of water.`,
    },
  ]);

  useEffect(() => {
    tour.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Simulation>
      <Simulation.Heading title="Urban Heat Island" tour={tour} />
      <Simulation.Main>
        <Simulation.Sidebar>
          <SideSection ref={brushRef} title="Brush">
            <div
              role="radiogroup"
              aria-label="Material"
              className="mb-4 grid gap-2"
            >
              {urban.materials.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={brushMaterial === m.id}
                  onClick={() => setBrushMaterial(m.id)}
                  className={`flex cursor-pointer items-center gap-3 p-2 px-3 text-left ${
                    brushMaterial === m.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-primary-200 hover:bg-primary-300'
                  }`}
                >
                  <span
                    className="inline-block h-5 w-5 shrink-0 border border-slate-600"
                    style={{ background: swatch[m.id] }}
                  />
                  {m.name}
                </button>
              ))}
            </div>
            <Slider
              label="Radius"
              value={radius}
              min={0}
              max={MAX_BRUSH_RADIUS}
              step={1}
              unit="cells"
              onChange={setRadius}
            />
            <div className="mb-4 flex gap-4">
              {(['round', 'square'] as const).map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="brush-shape"
                    checked={shape === s}
                    onChange={() => setShape(s)}
                    className="accent-primary-600"
                  />
                  {s === 'round' ? 'Round' : 'Square'}
                </label>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-4">
              <ToolButton
                onClick={() => {
                  urban.fillMaterial(brushMaterial);
                  notify();
                  afterEdit();
                }}
              >
                Fill all
              </ToolButton>
              <ToolButton
                onClick={() => {
                  urban.fillTemperature(INITIAL_TEMPERATURE_K);
                  diverged.current = null;
                  afterAdvance({ force: true });
                }}
              >
                Reset temperatures
              </ToolButton>
            </div>
            <Labeled label="Scene">
              <select
                value=""
                onChange={(e) => {
                  const kind = e.target.value as LayoutKind;
                  if (!kind) return;
                  urban.loadTypes(
                    makeLayout(kind, urban.rows, urban.cols, idOf)
                  );
                  notify();
                  afterEdit();
                }}
                className="border-primary-300 w-full rounded border bg-white px-2 py-1"
              >
                <option value="">Replace the map with…</option>
                {(Object.keys(LAYOUTS) as LayoutKind[]).map((k) => (
                  <option key={k} value={k}>
                    {LAYOUTS[k]}
                  </option>
                ))}
              </select>
            </Labeled>
          </SideSection>

          <SideSection ref={simRef} title="Simulation">
            <div className="mb-4 flex flex-wrap gap-4">
              <ToolButton
                onClick={() => {
                  if (diverged.current) return;
                  setPlaying((p) => !p);
                }}
                disabled={!!readout.diverged}
              >
                {playing ? 'Pause' : 'Play'}
              </ToolButton>
              <ToolButton onClick={() => (setPlaying(false), restart('city'))}>
                Restart
              </ToolButton>
            </div>
            <Slider
              label="Speed"
              value={speed}
              min={SPEED.min}
              max={SPEED.max}
              step={SPEED.step}
              unit="h / s"
              decimals={2}
              onChange={setSpeed}
            />
            <Slider
              label="Latitude"
              value={latitude}
              min={0}
              max={90}
              step={1}
              unit="°"
              onChange={setLatitude}
            />
            <Labeled label="Grid size">
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="border-primary-300 w-full rounded border bg-white px-2 py-1"
              >
                {GRID_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} × {n} cells ({n * 10} m × {n * 10} m)
                  </option>
                ))}
              </select>
            </Labeled>
            <p className="mt-4 tabular-nums opacity-50">
              Day {Math.floor(readout.elapsedHours / 24) + 1},{' '}
              {clock(readout.hourOfDay)}. Mean temperature{' '}
              {Number.isFinite(readout.meanK)
                ? show(readout.meanK).toFixed(2)
                : '–'}{' '}
              {unit}
            </p>
            <p className="tabular-nums opacity-50">
              {playing
                ? `${readout.stepsPerSecond.toFixed(0)} steps/s · ${readout.msPerStep.toFixed(2)} ms/step`
                : 'Paused'}
            </p>
          </SideSection>

          <SideSection ref={atmoRef} title="Atmosphere">
            <Slider
              label="CO₂"
              value={co2}
              min={GRID.co2Ppm.min}
              max={GRID.co2Ppm.max}
              step={5}
              unit="ppm"
              onChange={setCo2}
            />
            <Slider
              label="CH₄"
              value={ch4}
              min={GRID.ch4Ppm.min}
              max={GRID.ch4Ppm.max}
              step={0.1}
              unit="ppm"
              decimals={1}
              onChange={setCh4}
            />
          </SideSection>

          <SideSection ref={heatRef} title="Heatmap">
            <Labeled label="Color map">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as PresetKey)}
                className="border-primary-300 w-full rounded border bg-white px-2 py-1"
              >
                {(
                  Object.keys(COLOR_PRESETS) as (keyof typeof COLOR_PRESETS)[]
                ).map((k) => (
                  <option key={k} value={k}>
                    {COLOR_PRESETS[k].label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </Labeled>
            <div className="mt-4 mb-4">
              <div className="mb-1 font-medium">Custom colors (cold → hot)</div>
              <div className="flex gap-4">
                {custom.map((c, i) => (
                  <input
                    key={i}
                    type="color"
                    aria-label={['Cold', 'Middle', 'Hot'][i]}
                    value={c}
                    onChange={(e) => {
                      setCustom(
                        custom.map((o, j) => (j === i ? e.target.value : o))
                      );
                      setPreset('custom');
                    }}
                    className="border-primary-300 h-9 w-14 cursor-pointer border bg-white"
                  />
                ))}
              </div>
            </div>
            <label className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRange}
                onChange={(e) => setAutoRange(e.target.checked)}
                className="accent-primary-600"
              />
              Automatic temperature scale
            </label>
            {!autoRange && (
              <div className="mb-4 flex items-center gap-2">
                Temperature range
                {[0, 1].map((i) => (
                  <input
                    key={i}
                    type="number"
                    aria-label={i === 0 ? `Lowest ${unit}` : `Highest ${unit}`}
                    value={Number(show(fixedRange[i]).toFixed(1))}
                    step={1}
                    onChange={(e) => {
                      const k = celsius
                        ? Number(e.target.value) + KELVIN_AT_0C
                        : Number(e.target.value);
                      if (Number.isFinite(k))
                        setFixedRange(
                          i === 0 ? [k, fixedRange[1]] : [fixedRange[0], k]
                        );
                    }}
                    className="border-primary-300 w-24 rounded border bg-white px-2 py-1"
                  />
                ))}
                <span>{unit}</span>
              </div>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={celsius}
                onChange={(e) => setCelsius(e.target.checked)}
                className="accent-primary-600"
              />
              Show temperatures in °C
            </label>
          </SideSection>
          <DataExport
            filename="urban-history"
            sheetName="History"
            description={`The whole recorded history (last ${HISTORY_HOURS} simulated hours): time, and the average, minimum and maximum temperature of the grid and of each material, in ${unit}.`}
            columns={exportColumns}
            rows={() => history.current}
          />
        </Simulation.Sidebar>

        <div ref={viewRef} className="min-w-0 flex-1 p-8">
          {readout.diverged && (
            <p role="alert" className="mb-4 bg-red-100 p-4 text-red-900">
              The simulation was stopped: {readout.diverged} Press Restart to
              begin again.
            </p>
          )}
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              {
                id: 'editor',
                label: 'Grid editor',
                content: (
                  <GridEditor
                    urban={urban}
                    size={size}
                    bus={bus.current}
                    palette={palette}
                    brush={{ material: brushMaterial, radius, shape }}
                    onEdit={afterEdit}
                    legend={urban.materials.map((m) => ({
                      name: m.name,
                      color: swatch[m.id],
                    }))}
                  />
                ),
              },
              {
                id: 'heatmap',
                label: 'Temperature map',
                content: (
                  <Heatmap
                    urban={urban}
                    size={size}
                    bus={bus.current}
                    lut={lut}
                    stops={stops}
                    fixedRange={autoRange ? null : fixedRange}
                    show={show}
                    unit={unit}
                    materials={urban.materials}
                  />
                ),
              },
              {
                id: 'history',
                label: 'History',
                content: (
                  <VariablePlot
                    mode="line"
                    variables={variables}
                    points={points}
                    defaultX="time"
                    defaultY="all_avg"
                    axes={axes}
                    onAxesChange={setAxes}
                    onClear={() => {
                      history.current = [];
                      afterAdvance({ force: true });
                    }}
                    clearLabel="Clear history"
                    caption={(n) =>
                      `${n} recorded data point${n === 1 ? '' : 's'}. Only the last ${HISTORY_HOURS} simulated hours (${HISTORY_HOURS / 24} days) are retained.`
                    }
                  />
                ),
              },
            ]}
          />
        </div>
      </Simulation.Main>
      <Simulation.Footer></Simulation.Footer>
      <TourView tour={tour} />
    </Simulation>
  );
}

const clock = (hour: number) => {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ---- canvases --------------------------------------------------------------------------------------------------------

/** Registers a draw function on the bus, calling it now and whenever it changes or the solver advances. */
function useRedraw(bus: Bus, draw: () => void) {
  useEffect(() => {
    bus.add(draw);
    draw();
    return () => {
      bus.delete(draw);
    };
  }, [bus, draw]);
}

function paintImage(
  canvas: HTMLCanvasElement | null,
  image: Uint8ClampedArray,
  w: number,
  h: number
) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(
    new ImageData(image as Uint8ClampedArray<ArrayBuffer>, w, h),
    0,
    0
  );
}

/** Cell under a pointer event on a canvas that shows the whole grid. */
function cellUnder(
  e: ReactPointerEvent<HTMLCanvasElement>,
  rows: number,
  cols: number
) {
  const rect = e.currentTarget.getBoundingClientRect();
  return {
    row: Math.floor(((e.clientY - rect.top) / rect.height) * rows),
    col: Math.floor(((e.clientX - rect.left) / rect.width) * cols),
    rect,
  };
}

function GridEditor({
  urban,
  size,
  bus,
  palette,
  brush,
  onEdit,
  legend,
}: {
  urban: Urban;
  size: number;
  bus: Bus;
  palette: Uint8Array;
  brush: { material: number; radius: number; shape: BrushShape };
  onEdit: () => void;
  legend: { name: string; color: string }[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const last = useRef<{ row: number; col: number } | null>(null);

  const draw = useCallback(() => {
    paintImage(
      canvas.current,
      urban.renderMaterials(palette),
      urban.cols,
      urban.rows
    );
  }, [urban, palette, size]); // eslint-disable-line react-hooks/exhaustive-deps
  useRedraw(bus, draw);

  const stroke = (row: number, col: number) => {
    const from = last.current ?? { row, col };
    const dist = Math.hypot(row - from.row, col - from.col);
    const n = Math.max(1, Math.ceil(dist / Math.max(1, brush.radius / 2)));
    for (let i = 1; i <= n; i++)
      urban.paint(
        Math.round(from.row + ((row - from.row) * i) / n),
        Math.round(from.col + ((col - from.col) * i) / n),
        brush.radius,
        brush.material,
        brush.shape
      );
    last.current = { row, col };
    draw();
    onEdit();
  };

  const moveCursor = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const el = cursor.current;
    if (!el) return;
    const { row, col, rect } = cellUnder(e, urban.rows, urban.cols);
    const cell = rect.width / urban.cols;
    const d = (2 * brush.radius + 1) * cell;
    el.style.display = 'block';
    el.style.width = el.style.height = `${d}px`;
    el.style.left = `${(col - brush.radius) * cell}px`;
    el.style.top = `${(row - brush.radius) * cell}px`;
    el.style.borderRadius = brush.shape === 'round' ? '50%' : '0';
  };

  return (
    <div>
      <p className="mb-4 max-w-prose text-sm text-slate-600">
        Paint materials onto the grid with the brush in the sidebar. Each cell
        is 10 m wide. Painting works while the simulation runs.
      </p>
      <div className="relative inline-block w-full max-w-[720px] overflow-hidden bg-slate-200">
        <canvas
          ref={canvas}
          width={size}
          height={size}
          aria-label="Material map; drag to paint"
          className="block w-full cursor-crosshair touch-none"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: '1 / 1',
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            last.current = null;
            const { row, col } = cellUnder(e, urban.rows, urban.cols);
            stroke(row, col);
          }}
          onPointerMove={(e) => {
            moveCursor(e);
            if (e.buttons & 1) {
              const { row, col } = cellUnder(e, urban.rows, urban.cols);
              stroke(row, col);
            }
          }}
          onPointerUp={() => (last.current = null)}
          onPointerCancel={() => (last.current = null)}
          onPointerLeave={() => {
            if (cursor.current) cursor.current.style.display = 'none';
          }}
        />
        <div
          ref={cursor}
          className="pointer-events-none absolute hidden border-2 border-white mix-blend-difference"
        />
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {legend.map((l) => (
          <li key={l.name} className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 border border-slate-600"
              style={{ background: l.color }}
            />
            {l.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Heatmap({
  urban,
  size,
  bus,
  lut,
  stops,
  fixedRange,
  show,
  unit,
  materials,
}: {
  urban: Urban;
  size: number;
  bus: Bus;
  lut: Uint8Array;
  stops: readonly string[];
  /** [lo, hi] in K, or `null` to follow the grid's current extremes. */
  fixedRange: [number, number] | null;
  show: (kelvin: number) => number;
  unit: string;
  materials: Material[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<{ row: number; col: number } | null>(null);
  const [scale, setScale] = useState<[number, number]>([0, 1]);
  const [hoverText, setHoverText] = useState(
    'Hover over a cell to read its temperature.'
  );

  const draw = useCallback(() => {
    let lo: number;
    let hi: number;
    if (fixedRange) [lo, hi] = fixedRange;
    else {
      const all = urban.stats().all;
      lo = Number.isFinite(all.min) ? all.min : 270;
      hi = Number.isFinite(all.max) ? all.max : 320;
      if (hi - lo < 1) {
        lo -= 0.5;
        hi += 0.5;
      }
    }
    paintImage(
      canvas.current,
      urban.renderTemperature(lut, lo, hi),
      urban.cols,
      urban.rows
    );
    setScale((s) => (s[0] === lo && s[1] === hi ? s : [lo, hi]));
    const h = hover.current;
    const c = h && urban.cell(h.row, h.col);
    if (h && c) {
      const name =
        materials.find((m) => m.id === c.material)?.name ?? 'Unknown';
      setHoverText(
        `${name} · ${show(c.temperatureK).toFixed(2)} ${unit} · row ${h.row + 1}, column ${h.col + 1}`
      );
    }
  }, [urban, size, lut, fixedRange, show, unit, materials]); // eslint-disable-line react-hooks/exhaustive-deps
  useRedraw(bus, draw);

  return (
    <div>
      <div className="relative inline-block w-full max-w-[720px] bg-slate-200">
        <canvas
          ref={canvas}
          width={size}
          height={size}
          aria-label="Temperature of every cell"
          className="block w-full"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: '1 / 1',
          }}
          onPointerMove={(e) => {
            hover.current = cellUnder(e, urban.rows, urban.cols);
            draw();
          }}
          onPointerLeave={() => {
            hover.current = null;
            setHoverText('Hover over a cell to read its temperature.');
          }}
        />
      </div>
      <div className="mt-4 max-w-[720px]">
        <div
          className="h-4 w-full border border-slate-400"
          style={{
            background: `linear-gradient(to right, ${stops.join(', ')})`,
          }}
          aria-hidden
        />
        <div className="mt-1 flex justify-between text-sm tabular-nums">
          <span>
            {show(scale[0]).toFixed(1)} {unit}
          </span>
          <span>
            {show((scale[0] + scale[1]) / 2).toFixed(1)} {unit}
          </span>
          <span>
            {show(scale[1]).toFixed(1)} {unit}
          </span>
        </div>
      </div>
      <p className="mt-4 tabular-nums" aria-live="off">
        {hoverText}
      </p>
    </div>
  );
}

// ---- small pieces ----------------------------------------------------------------------------------------------------

function SideSection({
  title,
  children,
  ref,
}: {
  title: string;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className="mb-10">
      <h2 className="mb-6 text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

function ToolButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      className="relative cursor-pointer bg-slate-500 p-2 px-3 text-white before:absolute before:-inset-1 before:block before:w-0 before:bg-slate-700 before:transition-all hover:before:w-[calc(100%+8px)] disabled:cursor-not-allowed disabled:opacity-50 disabled:before:hidden"
    >
      <span className="relative">{children}</span>
    </button>
  );
}
