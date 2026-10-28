'use client';

import { useMemo, useState } from 'react';
import { Chart, type ChartMarker, type ChartSeries } from './chart';

export interface PlotVariable {
  label: string;
  unit: string;
  /** Digits after the decimal point in tick labels and the legend. */
  decimals: number;
}

export interface VariablePlotProps<K extends string> {
  /** The variables the viewer can choose between, keyed by name. */
  variables: Record<K, PlotVariable>;
  /** Collected points, oldest first. The last one is the "current" point and is highlighted. */
  points: readonly Record<K, number>[];
  defaultX: K;
  defaultY: K;
  /** Initial variable on the second Y axis; none by default. */
  defaultY2?: K;
  /** Called by the clear button. The button is hidden when omitted. */
  onClear?: () => void;
  clearLabel?: string;
  /** Text under the chart; receives the number of points. */
  caption?: (count: number) => React.ReactNode;
  /** Plot height in px. */
  height?: number;
}

/**
 * Scatter plot of any chosen variable against another, over a collection of points, with an optional second Y axis.
 * The viewer picks the variables with the selectors above the chart.
 */
export function VariablePlot<K extends string>({
  variables,
  points,
  defaultX,
  defaultY,
  defaultY2,
  onClear,
  clearLabel = 'Clear',
  caption,
  height = 480,
}: VariablePlotProps<K>) {
  const [xKey, setXKey] = useState<K>(defaultX);
  const [yKey, setYKey] = useState<K>(defaultY);
  const [y2Key, setY2Key] = useState<K | ''>(defaultY2 ?? '');

  // uPlot needs ascending X.
  const sorted = useMemo(
    () => [...points].sort((a, b) => a[xKey] - b[xKey]),
    [points, xKey]
  );
  const markers = useMemo<ChartMarker[]>(() => {
    const now = points[points.length - 1];
    if (!now) return [];
    const out: ChartMarker[] = [{ x: now[xKey], y: now[yKey], size: 7 }];
    if (y2Key)
      out.push({ x: now[xKey], y: now[y2Key], axis: 'right', size: 7 });
    return out;
  }, [points, xKey, yKey, y2Key]);

  const x = useMemo(() => sorted.map((s) => s[xKey]), [sorted, xKey]);
  const series = useMemo<ChartSeries[]>(() => {
    const dots = { line: false, points: 7 } as const;
    const out: ChartSeries[] = [
      {
        id: 'y',
        label: variables[yKey].label,
        y: sorted.map((s) => s[yKey]),
        ...dots,
      },
    ];
    if (y2Key)
      out.push({
        id: 'y2',
        label: variables[y2Key].label,
        y: sorted.map((s) => s[y2Key]),
        axis: 'right',
        ...dots,
      });
    return out;
  }, [variables, sorted, yKey, y2Key]);

  const text = useMemo(
    () => ({
      title: `${variables[yKey].label} vs ${variables[xKey].label}`,
      xLabel: `${variables[xKey].label} (${variables[xKey].unit})`,
      yLabel: `${variables[yKey].label} (${variables[yKey].unit})`,
      y2Label: y2Key
        ? `${variables[y2Key].label} (${variables[y2Key].unit})`
        : undefined,
      formatX: (v: number) => v.toFixed(variables[xKey].decimals),
      formatY: (v: number) => v.toFixed(variables[yKey].decimals),
      formatY2: y2Key
        ? (v: number) => v.toFixed(variables[y2Key].decimals)
        : undefined,
    }),
    [variables, xKey, yKey, y2Key]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <VariableSelect
          label="X axis"
          value={xKey}
          options={variables}
          onChange={setXKey}
        />
        <VariableSelect
          label="Y axis"
          value={yKey}
          options={variables}
          onChange={setYKey}
        />
        <VariableSelect
          label="Second Y axis"
          value={y2Key}
          options={variables}
          onChange={setY2Key}
          allowNone
        />
        {onClear && (
          <button
            onClick={onClear}
            className="relative ml-auto cursor-pointer bg-red-500 p-2 px-3 text-white before:absolute before:-inset-1 before:block before:w-0 before:bg-red-700 before:transition-all hover:before:w-[calc(100%+8px)]"
          >
            <span className="relative">{clearLabel}</span>
          </button>
        )}
      </div>
      <Chart
        x={x}
        series={series}
        markers={markers}
        text={text}
        secondaryAxis={y2Key !== ''}
        height={height}
      />
      {caption && (
        <p className="mt-2 text-sm text-slate-600">{caption(points.length)}</p>
      )}
    </div>
  );
}

function VariableSelect<K extends string, V extends K | ''>({
  label,
  value,
  options,
  onChange,
  allowNone,
}: {
  label: string;
  value: V;
  options: Record<K, PlotVariable>;
  onChange: (v: V) => void;
  allowNone?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className="rounded border border-slate-300 bg-white px-2 py-1 font-normal"
      >
        {allowNone && <option value="">None</option>}
        {(Object.keys(options) as K[]).map((k) => (
          <option key={k} value={k}>
            {options[k].label}
          </option>
        ))}
      </select>
    </label>
  );
}
