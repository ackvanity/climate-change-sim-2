'use client';

import { useMemo, useState } from 'react';
import { Chart, type ChartMarker, type ChartSeries } from '@/components/chart';
import { Simulation } from '@/components/simulation';
import { Slider } from '@/components/slider';
import { Tabs } from '@/components/tabs';
import {
  layerAltitudesKm,
  summarize,
  type MacroState,
} from '@/interface/greenhouse/greenhouse';
import { useGreenhouse } from './use-greenhouse';

const PREINDUSTRIAL = { co2Ppm: 280, ch4Ppm: 0.7 };
const MAX_COLLECTED = 2000;

interface Setting {
  co2Ppm: number;
  ch4Ppm: number;
}

type MacroKey = 'co2Ppm' | 'ch4Ppm' | 'meanAtmosphereK' | 'surfaceK';

const MACROS: Record<
  MacroKey,
  { label: string; unit: string; decimals: number }
> = {
  co2Ppm: { label: 'CO₂', unit: 'ppm', decimals: 0 },
  ch4Ppm: { label: 'CH₄', unit: 'ppm', decimals: 2 },
  meanAtmosphereK: {
    label: 'Mean atmospheric temperature',
    unit: 'K',
    decimals: 2,
  },
  surfaceK: { label: 'Surface temperature', unit: 'K', decimals: 2 },
};
const MACRO_KEYS = Object.keys(MACROS) as MacroKey[];

const axisLabel = (k: MacroKey) => `${MACROS[k].label} (${MACROS[k].unit})`;
const formatter = (k: MacroKey) => (v: number) => v.toFixed(MACROS[k].decimals);

export function GreenhouseView() {
  const { solver, isMock } = useGreenhouse();
  const [co2, setCo2] = useState(420);
  const [ch4, setCh4] = useState(1.9);
  // Every setting the sliders have visited; the macro chart plots exactly these.
  const [collected, setCollected] = useState<Setting[]>([
    { co2Ppm: 420, ch4Ppm: 1.9 },
  ]);

  const move = (next: Setting) => {
    setCo2(next.co2Ppm);
    setCh4(next.ch4Ppm);
    setCollected((prev) => {
      const last = prev[prev.length - 1];
      if (last.co2Ppm === next.co2Ppm && last.ch4Ppm === next.ch4Ppm)
        return prev;
      return [...prev, next].slice(-MAX_COLLECTED);
    });
  };
  const clear = () => setCollected([{ co2Ppm: co2, ch4Ppm: ch4 }]);

  const profile = useMemo(() => solver.solve(co2, ch4), [solver, co2, ch4]);
  const baseline = useMemo(
    () => solver.solve(PREINDUSTRIAL.co2Ppm, PREINDUSTRIAL.ch4Ppm),
    [solver]
  );
  const states = useMemo(() => {
    const cache = new Map<string, MacroState>();
    return collected.map((c) => {
      const key = `${c.co2Ppm}/${c.ch4Ppm}`;
      let state = cache.get(key);
      if (!state) {
        state = summarize(c.co2Ppm, c.ch4Ppm, solver.solve(c.co2Ppm, c.ch4Ppm));
        cache.set(key, state);
      }
      return state;
    });
  }, [solver, collected]);

  return (
    <Simulation>
      <Simulation.Heading title="Thermodynamics of Climate Change"></Simulation.Heading>
      <Simulation.Main>
        <Simulation.Sidebar>
          <h2 className="mb-6 text-xl">Atmosphere</h2>
          <Slider
            label="CO₂"
            value={co2}
            min={100}
            max={2000}
            step={5}
            unit="ppm"
            onChange={(v) => move({ co2Ppm: v, ch4Ppm: ch4 })}
          />
          <Slider
            label="CH₄"
            value={ch4}
            min={0.2}
            max={20}
            step={0.1}
            unit="ppm"
            decimals={1}
            onChange={(v) => move({ co2Ppm: co2, ch4Ppm: v })}
          />
          {isMock && (
            <p className="text-sm">
              Showing a simplified stand-in model: the radiative-equilibrium
              solver is not yet available in the browser.
            </p>
          )}
        </Simulation.Sidebar>
        <div className="min-w-0 flex-1 p-8">
          <Tabs
            tabs={[
              {
                id: 'profile',
                label: 'Atmospheric profile',
                content: <ProfileChart profile={profile} baseline={baseline} />,
              },
              {
                id: 'macro',
                label: 'Macro properties',
                content: <MacroChart states={states} onClear={clear} />,
              },
            ]}
          />
        </div>
      </Simulation.Main>
      <Simulation.Footer></Simulation.Footer>
    </Simulation>
  );
}

function ProfileChart({
  profile,
  baseline,
}: {
  profile: Float64Array;
  baseline: Float64Array;
}) {
  // Surface first (0 km), then the slab mid-points.
  const altitude = useMemo(() => [0, ...layerAltitudesKm], []);
  const series = useMemo<ChartSeries[]>(() => {
    const withSurface = (T: Float64Array) => [
      T[T.length - 1],
      ...T.subarray(0, T.length - 1),
    ];
    return [
      { id: 'now', label: 'Current', y: withSurface(profile) },
      {
        id: 'base',
        label: 'Pre-industrial',
        y: withSurface(baseline),
        color: '#94a3b8',
        dash: [6, 4],
        width: 1.5,
      },
    ];
  }, [profile, baseline]);

  return (
    <Chart
      x={altitude}
      series={series}
      vertical
      height={560}
      text={{
        title: 'Equilibrium temperature profile',
        xLabel: 'Altitude (km)',
        yLabel: 'Temperature (K)',
        formatY: (v) => v.toFixed(0),
      }}
    />
  );
}

function MacroChart({
  states,
  onClear,
}: {
  states: MacroState[];
  onClear: () => void;
}) {
  const [xKey, setXKey] = useState<MacroKey>('co2Ppm');
  const [yKey, setYKey] = useState<MacroKey>('surfaceK');
  const [y2Key, setY2Key] = useState<MacroKey | ''>('');

  // uPlot needs ascending X.
  const sorted = useMemo(
    () => [...states].sort((a, b) => a[xKey] - b[xKey]),
    [states, xKey]
  );
  const markers = useMemo<ChartMarker[]>(() => {
    const now = states[states.length - 1];
    if (!now) return [];
    const out: ChartMarker[] = [{ x: now[xKey], y: now[yKey], size: 7 }];
    if (y2Key)
      out.push({ x: now[xKey], y: now[y2Key], axis: 'right', size: 7 });
    return out;
  }, [states, xKey, yKey, y2Key]);

  const x = useMemo(() => sorted.map((s) => s[xKey]), [sorted, xKey]);
  const series = useMemo<ChartSeries[]>(() => {
    const dots = { line: false, points: 7 } as const;
    const out: ChartSeries[] = [
      {
        id: 'y',
        label: MACROS[yKey].label,
        y: sorted.map((s) => s[yKey]),
        ...dots,
      },
    ];
    if (y2Key)
      out.push({
        id: 'y2',
        label: MACROS[y2Key].label,
        y: sorted.map((s) => s[y2Key]),
        axis: 'right',
        ...dots,
      });
    return out;
  }, [sorted, yKey, y2Key]);

  const text = useMemo(
    () => ({
      title: `${MACROS[yKey].label} vs ${MACROS[xKey].label}`,
      xLabel: axisLabel(xKey),
      yLabel: axisLabel(yKey),
      y2Label: y2Key ? axisLabel(y2Key) : undefined,
      formatX: formatter(xKey),
      formatY: formatter(yKey),
      formatY2: y2Key ? formatter(y2Key) : undefined,
    }),
    [xKey, yKey, y2Key]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <VariableSelect label="X axis" value={xKey} onChange={setXKey} />
        <VariableSelect label="Y axis" value={yKey} onChange={setYKey} />
        <VariableSelect
          label="Second Y axis"
          value={y2Key}
          onChange={setY2Key}
          allowNone
        />
        <button
          onClick={onClear}
          className="relative ml-auto cursor-pointer bg-red-500 p-2 px-3 text-white before:absolute before:-inset-1 before:block before:w-0 before:bg-red-700 before:transition-all hover:before:w-[calc(100%+8px)]"
        >
          <span className="relative">Clear collected data</span>
        </button>
      </div>
      <Chart
        x={x}
        series={series}
        markers={markers}
        text={text}
        secondaryAxis={y2Key !== ''}
        height={480}
      />
      <p className="mt-2 text-sm text-slate-600">
        {states.length} computed {states.length === 1 ? 'point' : 'points'}, one
        for each setting the sliders have visited. The red dot is the current
        setting.
      </p>
    </div>
  );
}

function VariableSelect<T extends MacroKey | ''>({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  allowNone?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded border border-slate-300 bg-white px-2 py-1 font-normal"
      >
        {allowNone && <option value="">None</option>}
        {MACRO_KEYS.map((k) => (
          <option key={k} value={k}>
            {MACROS[k].label}
          </option>
        ))}
      </select>
    </label>
  );
}
