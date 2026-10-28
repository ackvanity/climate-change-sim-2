'use client';

import { useMemo, useState } from 'react';
import { Chart, type ChartSeries } from '@/components/chart';
import { Simulation } from '@/components/simulation';
import { Slider } from '@/components/slider';
import { Tabs } from '@/components/tabs';
import { VariablePlot, type PlotVariable } from '@/components/variable-plot';
import {
  GRID,
  layerAltitudesKm,
  summarize,
  type MacroState,
} from '@/interface/greenhouse/greenhouse';
import { useGreenhouse } from './use-greenhouse';

// The sliders cover exactly the range the precomputed table covers (GRID, see compute/greenhouse/INTERFACE.md).
const CO2_STEP_PPM = 5;
const CH4_STEP_PPM = 0.1;
// The profile chart compares against the lowest gas amounts of that range.
const BASELINE = { co2Ppm: GRID.co2Ppm.min, ch4Ppm: GRID.ch4Ppm.min };
const MAX_COLLECTED = 2000;

interface Setting {
  co2Ppm: number;
  ch4Ppm: number;
}

type MacroKey = keyof MacroState;

const MACROS: Record<MacroKey, PlotVariable> = {
  co2Ppm: { label: 'CO₂', unit: 'ppm', decimals: 0 },
  ch4Ppm: { label: 'CH₄', unit: 'ppm', decimals: 2 },
  meanAtmosphereK: {
    label: 'Mean atmospheric temperature',
    unit: 'K',
    decimals: 2,
  },
  surfaceK: { label: 'Surface temperature', unit: 'K', decimals: 2 },
};

export default function Climate() {
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
    () => solver.solve(BASELINE.co2Ppm, BASELINE.ch4Ppm),
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
            min={GRID.co2Ppm.min}
            max={GRID.co2Ppm.max}
            step={CO2_STEP_PPM}
            unit="ppm"
            onChange={(v) => move({ co2Ppm: v, ch4Ppm: ch4 })}
          />
          <Slider
            label="CH₄"
            value={ch4}
            min={GRID.ch4Ppm.min}
            max={GRID.ch4Ppm.max}
            step={CH4_STEP_PPM}
            unit="ppm"
            decimals={1}
            onChange={(v) => move({ co2Ppm: co2, ch4Ppm: v })}
          />
          {isMock && (
            <p className="text-sm">
              Showing a simplified stand-in model: the precomputed
              radiative-equilibrium data is not yet available in the browser.
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
                content: (
                  <VariablePlot
                    variables={MACROS}
                    points={states}
                    defaultX="co2Ppm"
                    defaultY="surfaceK"
                    onClear={clear}
                    clearLabel="Clear collected data"
                    caption={(n) =>
                      `${n} computed ${n === 1 ? 'point' : 'points'}, one for each setting the sliders have visited. The red dot is the current setting.`
                    }
                  />
                ),
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
  // Surface first (0 km), then the slabs at their altitudes.
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
        label: `Baseline (${BASELINE.co2Ppm} ppm CO₂, ${BASELINE.ch4Ppm} ppm CH₄)`,
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
