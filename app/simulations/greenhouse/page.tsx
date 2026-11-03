'use client';

import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Chart, type ChartRef, type ChartSeries } from '@/components/chart';
import { Simulation } from '@/components/simulation';
import { Slider } from '@/components/slider';
import { Tabs } from '@/components/tabs';
import {
  VariablePlot,
  type PlotAxes,
  type PlotVariable,
} from '@/components/variable-plot';
import {
  GRID,
  layerAltitudesKm,
  summarize,
  type MacroState,
} from '@/interface/greenhouse/greenhouse';
import { useGreenhouse } from './use-greenhouse';
import { TourView, regionOf, useTour } from '@/components/use-tour';

// The sliders cover exactly the range the precomputed table covers (GRID, see compute/greenhouse/INTERFACE.md).
const CO2_STEP_PPM = 5;
const CH4_STEP_PPM = 0.1;
// The profile chart compares against the lowest gas amounts of that range.
const BASELINE = { co2Ppm: GRID.co2Ppm.min, ch4Ppm: GRID.ch4Ppm.min };
const MAX_COLLECTED = 2000;
// Atmosphere layer boundaries in km, for the tour's highlights. The model's top slab is the last altitude.
const TROPOPAUSE_KM = 12;
const STRATOPAUSE_KM = 50;
const MODEL_TOP_KM = layerAltitudesKm[layerAltitudesKm.length - 1];

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
  const [ch4, setCh4] = useState(1.0);
  // Every setting the sliders have visited; the macro chart plots exactly these.
  const [collected, setCollected] = useState<Setting[]>([
    { co2Ppm: 420, ch4Ppm: 1.0 },
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

  const [tab, setTab] = useState('profile');
  const [axes, setAxes] = useState<PlotAxes<MacroKey>>({
    x: 'co2Ppm',
    y: 'surfaceK',
    y2: '',
  });
  // Elements the tour highlights.
  const profileChart = useRef<ChartRef>(null);
  const co2Slider = useRef<HTMLDivElement>(null);
  const ch4Slider = useRef<HTMLDivElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);

  const showProfile = () => setTab('profile');
  const showMacro = (x: MacroKey) => {
    setTab('macro');
    setAxes({ x, y: 'surfaceK', y2: '' });
  };
  // The whole plotting area of the profile chart.
  const profileArea = () => {
    const r = profileChart.current?.getGraphBoundingRect();
    return (
      r && {
        x: [r.x, r.x + r.w] as [number, number],
        y: [r.y, r.y + r.h] as [number, number],
      }
    );
  };
  // A horizontal band of the profile chart between two altitudes (altitude runs up the Y direction).
  const altitudeBand = (fromKm: number, toKm: number) => () => {
    const chart = profileChart.current;
    const area = profileArea();
    if (!chart || !area) return null;
    return {
      x: area.x,
      y: [
        chart.getScreenCoordinates(fromKm, 0).y,
        chart.getScreenCoordinates(toKm, 0).y,
      ] as [number, number],
    };
  };

  const tour = useTour([
    {
      title: `Greenhouse Effect`,
      content: `The greenhouse effect occurs because the atmosphere naturally traps heat near the
      surface, like a blanket.

      **Greenhouse gases** have high potency to trap heat and therefore contribute the most to this
      effect. Human activities emit significant amounts of these gases, making the Earth too hot.

      However, not all parts of the atmosphere are affected equally.`,
    },
    {
      title: `Atmospheric profiles`,
      content: `Properties of the atmosphere (e.g. temperature) vary with height, so we use an
      atmospheric profile to show this behavior.

      Unlike a typical graph, an atmospheric profile uses the y axis to represent height and the x
      axis to represent temperature, with the ground having a height of zero.

      To see the value at a certain point, hover over its y-coordinate (height) and read the value
      on the bottom, namely the Current temperature.`,
      effect: showProfile,
      region: profileArea,
    },
    {
      title: `Baseline profiles`,
      content: `To compare warming effects, it's important to have a baseline to measure differences
      against. In this case, we've set a baseline of 420 ppm CO₂ and 1 ppm CH₄.

      This baseline value is plotted as the dashed line, and the temperature is noted as the
      Baseline temperature.`,
      effect: showProfile,
      region: profileArea,
    },
    {
      title: 'Atmosphere layers: Troposphere',
      content: `The troposphere, from 0–12 km, is dominated by convection. Warm air has lower
      density, so it naturally rises to the top and releases heat. Cold air from the top is heavier,
      so it sinks to the surface and absorbs heat.

      This process is **adiabatic**, so the total energy of the air is preserved. If we look at a
      small packet of $n$ moles of air with $f$ degrees of freedom and mass $m$ rising
      adiabatically, with its temperature equal to its surroundings, and maintaining a constant
      composition:

      $$E = mgh + \\frac{f+2}{2} nRT$$

      By conservation of energy:

      $$\\frac{dE}{dh} = 0$$

      $$mg + \\frac{f+2}{2} nR \\frac{dT}{dh} = 0$$

      $$\\frac{dT}{dh} = -\\frac{mg}{\\frac{f+2}{2} nR}$$

      This means that temperature decreases linearly with height. Defining the rate of decrease as
      the lapse rate, we say that the lapse rate is a well-defined constant. While the above
      calculation will yield a value of around 9.8 K/km, known as the **dry adiabatic lapse rate**,
      water vapor also has latent heat, which contributes heat, so the real lapse rate observed (the
      **moist adiabatic lapse rate**) is lower. Our baseline uses 6.5 K/km as a reference value.

      When the difference in temperature is too steep (e.g. a lapse rate of over 14 K/km), the gases
      mix to increase heat transfer and lower the temperature difference to the adiabatic rate
      again. This mechanism dominates the troposphere, so the gradient change is negligibly small
      when warming: most of the troposphere heats up alongside the surface.`,
      effect: showProfile,
      region: altitudeBand(0, TROPOPAUSE_KM),
    },
    {
      title: 'Atmosphere layers: Stratosphere',
      content: `The stratosphere is located just above the troposphere, starting at 12 km and ending
      at 50 km.

      The temperature trend in the troposphere begins reversing, with a relatively constant region
      at 12–20 km followed by a *rise* in temperature afterward. This occurs because ozone in the
      layer absorbs ultraviolet radiation from the sun, turning it into heat inside the atmosphere.
      The pocket of air becomes hotter to emit the excess heat, and because higher regions
      experience more direct exposure to the sun's radiation, this heating is more pronounced there.
      Greenhouse gases make this layer more opaque (have higher emissivity) at a wider range of
      wavelengths, helping the atmosphere radiate the heat more effectively at lower temperatures,
      so counterintuitively, this part *cools* down with more greenhouse gases.`,
      effect: showProfile,
      region: altitudeBand(TROPOPAUSE_KM, STRATOPAUSE_KM),
    },
    {
      title: 'Atmosphere layers: Mesosphere',
      content: `The mesosphere occurs above the stratosphere, and in this region ozone concentration
      drops again, meaning less heat absorbed in this region. Any greenhouse gas here helps emit
      energy to outer space, so the layer cools down.`,
      effect: showProfile,
      region: altitudeBand(STRATOPAUSE_KM, MODEL_TOP_KM),
    },
    {
      title: `Troposphere warming`,
      content: `Given that the mesosphere and stratosphere cool down with higher greenhouse gas
      concentrations, why does the surface heat up? This occurs because the gases make the upper
      layer of the atmosphere emit heat more efficiently — both toward and away from the Earth's
      surface. While this helps the layers cool down, it dumps excess heat into the lower part of
      the atmosphere, causing it to heat up. This is the warming that we all feel at the surface,
      and most climate models measure warming in this particular region.`,
      effect: showProfile,
      region: altitudeBand(0, TROPOPAUSE_KM),
    },
    {
      title: `Quantifying warming`,
      content: `If you look at the "Macro properties" tab, you can see an adjustable chart where you
      can plot properties of the atmosphere as a function of other properties. You can also plot two
      y-axes simultaneously! By varying carbon dioxide or methane concentrations, you can plot all
      the scenarios you generated before.`,
      effect: () => showMacro('co2Ppm'),
    },
    {
      title: `Carbon dioxide warming`,
      content: `Try dragging the carbon dioxide slider and see the path of points created. You can
      see that it follows a logarithmic scale with the warming effect weakening at higher
      concentrations. This happens because the more molecules there are, the more they compete to
      absorb the same wavelengths, so on average adding more gases to higher concentrations is less
      effective than adding the same amount to lower concentrations.`,
      effect: () => {
        showMacro('co2Ppm');
        move({ co2Ppm: 800, ch4Ppm: ch4 });
      },
      region: () => regionOf(co2Slider.current),
    },
    {
      title: `Methane warming`,
      content: `Try dragging the methane slider. A similar effect occurs with the same mechanism,
      only the curve looks slightly different because methane has different properties from carbon
      dioxide.`,
      effect: () => {
        showMacro('ch4Ppm');
        move({ co2Ppm: co2, ch4Ppm: 4.0 });
      },
      region: () => regionOf(ch4Slider.current),
    },
    {
      title: `Resetting`,
      content: `If you want to clear up old experiments/points, use the "Clear collected data"
      button to reset your simulation. This lets you take a new set of data points to plot.`,
      effect: () => setTab('macro'),
      region: () => regionOf(clearButton.current),
    },
  ]);

  useEffect(() => {
    tour.start();
  }, []);

  return (
    <Simulation>
      <Simulation.Heading
        title="Thermodynamics of Climate Change"
        tour={tour}
      ></Simulation.Heading>
      <Simulation.Main>
        <Simulation.Sidebar>
          <h2 className="mb-6 text-xl">Atmosphere</h2>
          <Slider
            ref={co2Slider}
            label="CO₂"
            value={co2}
            min={GRID.co2Ppm.min}
            max={GRID.co2Ppm.max}
            step={CO2_STEP_PPM}
            unit="ppm"
            onChange={(v) => move({ co2Ppm: v, ch4Ppm: ch4 })}
          />
          <Slider
            ref={ch4Slider}
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
            value={tab}
            onChange={setTab}
            tabs={[
              {
                id: 'profile',
                label: 'Atmospheric profile',
                content: (
                  <ProfileChart
                    ref={profileChart}
                    profile={profile}
                    baseline={baseline}
                  />
                ),
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
                    axes={axes}
                    onAxesChange={setAxes}
                    clearRef={clearButton}
                    onClear={clear}
                    clearLabel="Clear collected data"
                    caption={(n) =>
                      `Showing ${n} computed ${n === 1 ? 'point' : 'points'} corresponding to previous atmospheric configurations. Current state is highlighted as the red point. At most ${MAX_COLLECTED} most recent points will be shown.`
                    }
                  />
                ),
              },
            ]}
          />
        </div>
      </Simulation.Main>
      <Simulation.Footer></Simulation.Footer>
      <TourView tour={tour}></TourView>
    </Simulation>
  );
}

function ProfileChart({
  profile,
  baseline,
  ref,
}: {
  profile: Float64Array;
  baseline: Float64Array;
  ref?: Ref<ChartRef>;
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
      ref={ref}
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
