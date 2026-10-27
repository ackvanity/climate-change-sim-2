'use client';

import 'uplot/dist/uPlot.min.css';
import type uPlot from 'uplot';
import { useEffect, useMemo, useRef } from 'react';

// Hex values of the design tokens in app/globals.css; canvas drawing cannot read CSS variables directly.
const PALETTE = ['#6a942b', '#5c8889', '#e2ae35', '#9c3a1f'];
const MARKER_COLOR = '#cf3e2a';
const AXIS_COLOR = '#475569'; // slate-600
const GRID_COLOR = '#e2e8f0'; // slate-200

export type ChartValues = ArrayLike<number | null>;

export interface ChartSeries {
  /** Stable key; defaults to the label. Changing it rebuilds the chart. */
  id?: string;
  label: string;
  /** One value per entry of the shared `x` array; `null` leaves a gap. */
  y: ChartValues;
  /** Which Y axis the series is plotted against. Ignored (series is dropped) if `secondaryAxis` is off. */
  axis?: 'left' | 'right';
  color?: string;
  width?: number;
  dash?: number[];
  /** Fill colour under the line. */
  fill?: string;
  /** `true`/`false`, or a size in px. Defaults to uPlot's automatic choice. */
  points?: boolean | number;
  /** `false` draws only points (e.g. to mark a single value). */
  line?: boolean;
  /** Format this series' value in the legend; falls back to the axis formatter. */
  format?: (v: number) => string;
}

/** Every string drawn by the chart. All optional; pass only what you want to change. */
export interface ChartText {
  title?: string;
  xLabel?: string;
  yLabel?: string;
  /** Label of the secondary Y axis (only used when `secondaryAxis` is on). */
  y2Label?: string;
  /** Shown instead of the plot when there is no data. */
  empty?: string;
  /** Accessible description of the chart. */
  ariaLabel?: string;
  /** Tick and legend formatting, e.g. `(v) => `${v.toFixed(1)} K``. */
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  formatY2?: (v: number) => string;
}

/** A highlighted point drawn over the series, in data coordinates. */
export interface ChartMarker {
  x: number;
  y: number;
  /** Plotted against the secondary axis when it is on. */
  axis?: 'left' | 'right';
  color?: string;
  /** Radius in CSS px. */
  size?: number;
}

export interface ChartProps {
  /** Shared X values, ascending. */
  x: ChartValues;
  series: ChartSeries[];
  text?: ChartText;
  /** Show a second Y axis on the right and honour `axis: 'right'` series. When off the axis is not created at all. */
  secondaryAxis?: boolean;
  /** Individual points to highlight, e.g. the latest value. */
  markers?: ChartMarker[];
  /** Swap the axes: X runs up the left edge, Y along the bottom (e.g. altitude profiles). */
  vertical?: boolean;
  /** Fixed scale ranges `[min, max]`; omit a scale to autorange. */
  range?: { x?: [number, number]; y?: [number, number]; y2?: [number, number] };
  /** Final say over the uPlot options (restyle anything). Memoise it: a new identity rebuilds the chart. */
  options?: (defaults: uPlot.Options) => uPlot.Options;
  /** Plot height in px; the width follows the container. */
  height?: number;
  className?: string;
}

const noop = (v: number) => String(+v.toPrecision(6));

export function Chart({
  x,
  series,
  text,
  secondaryAxis = false,
  markers,
  vertical = false,
  range,
  options,
  height = 420,
  className,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const visible = useMemo(
    () => series.filter((s) => secondaryAxis || (s.axis ?? 'left') === 'left'),
    [series, secondaryAxis]
  );

  // Latest props for the closures handed to uPlot, so formatters can change without rebuilding the chart.
  const latest = useRef({ x, text, visible, markers });
  latest.current = { x, text, visible, markers };

  // Anything that changes the shape of the chart (not just its values) rebuilds the uPlot instance.
  const structureKey = JSON.stringify([
    vertical,
    secondaryAxis,
    range,
    height,
    text?.title,
    text?.xLabel,
    text?.yLabel,
    text?.y2Label,
    visible.map((s) => [
      s.id ?? s.label,
      s.label,
      s.axis,
      s.color,
      s.width,
      s.dash,
      s.fill,
      s.points,
      s.line,
    ]),
  ]);

  const empty = x.length === 0 || visible.length === 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || empty) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    import('uplot').then(({ default: UPlot }) => {
      if (cancelled) return;
      const { x: xs, text: t, visible: vis } = latest.current;
      const fmtX = (v: number) => (t?.formatX ?? noop)(v);
      const fmtY = (v: number) => (t?.formatY ?? noop)(v);
      const fmtY2 = (v: number) => (t?.formatY2 ?? noop)(v);

      const axisBase = {
        stroke: AXIS_COLOR,
        grid: { stroke: GRID_COLOR, width: 1 },
        ticks: { stroke: GRID_COLOR },
      };
      const axes: uPlot.Axis[] = [
        {
          ...axisBase,
          scale: 'x',
          side: vertical ? 3 : 2,
          label: t?.xLabel,
          values: (_u, vals) => vals.map((v) => fmtX(v)),
        },
        {
          ...axisBase,
          scale: 'y',
          side: vertical ? 2 : 3,
          // Fixed so tick labels that widen as data changes never overlap the axis label.
          size: vertical ? undefined : 72,
          label: t?.yLabel,
          values: (_u, vals) => vals.map((v) => fmtY(v)),
        },
      ];
      const scales: uPlot.Scales = {
        x: {
          time: false,
          ori: vertical ? 1 : 0,
          dir: 1,
          range: range?.x,
        },
        y: { ori: vertical ? 0 : 1, range: range?.y },
      };
      if (secondaryAxis) {
        axes.push({
          ...axisBase,
          scale: 'y2',
          side: vertical ? 0 : 1,
          size: vertical ? undefined : 72,
          label: t?.y2Label,
          grid: { show: false },
          values: (_u, vals) => vals.map((v) => fmtY2(v)),
        });
        scales.y2 = { ori: vertical ? 0 : 1, range: range?.y2 };
      }

      const defaults: uPlot.Options = {
        width: container.clientWidth,
        height,
        title: t?.title,
        padding: [8, 16, 0, 0],
        scales,
        axes,
        series: [
          {
            label: t?.xLabel ?? 'x',
            value: (_u, v) => (v == null ? '--' : fmtX(v)),
          },
          ...vis.map((s, i): uPlot.Series => {
            const onRight = secondaryAxis && s.axis === 'right';
            const color = s.color ?? PALETTE[i % PALETTE.length];
            const fmt = s.format ?? (onRight ? fmtY2 : fmtY);
            return {
              label: s.label,
              scale: onRight ? 'y2' : 'y',
              stroke: color,
              // A zero-width stroke hides the line; `paths: () => null` stops points redrawing after setData.
              width: s.line === false ? 0 : (s.width ?? 2),
              dash: s.dash,
              fill: s.fill,
              points:
                s.line === false
                  ? { show: false }
                  : s.points == null
                    ? undefined
                    : {
                        show: s.points !== false,
                        size: typeof s.points === 'number' ? s.points : 9,
                        fill: color,
                      },
              value: (_u, v) => (v == null ? '--' : fmt(v)),
            };
          }),
        ],
        hooks: {
          // Dot-only series and markers are drawn here: uPlot's own points do not reliably redraw after setData.
          draw: [
            (u) => {
              const dot = (
                x: number,
                y: number,
                scale: string,
                color: string,
                size: number
              ) => {
                const px = u.valToPos(x, 'x', true);
                const py = u.valToPos(y, scale, true);
                const [cx, cy] = vertical ? [py, px] : [px, py];
                const { left, top, width, height } = u.bbox;
                if (
                  cx < left ||
                  cx > left + width ||
                  cy < top ||
                  cy > top + height
                )
                  return;
                u.ctx.fillStyle = color;
                u.ctx.beginPath();
                u.ctx.arc(cx, cy, size * devicePixelRatio, 0, 2 * Math.PI);
                u.ctx.fill();
              };
              u.ctx.save();
              latest.current.visible.forEach((s, i) => {
                if (s.line !== false || s.points === false) return;
                const scale = secondaryAxis && s.axis === 'right' ? 'y2' : 'y';
                const color = s.color ?? PALETTE[i % PALETTE.length];
                const size = typeof s.points === 'number' ? s.points / 2 : 4;
                const ys = u.data[i + 1];
                u.data[0].forEach((x, j) => {
                  const y = ys[j];
                  if (y != null) dot(x, y, scale, color, size);
                });
              });
              for (const m of latest.current.markers ?? [])
                dot(
                  m.x,
                  m.y,
                  secondaryAxis && m.axis === 'right' ? 'y2' : 'y',
                  m.color ?? MARKER_COLOR,
                  m.size ?? 6
                );
              u.ctx.restore();
            },
          ],
        },
        cursor: { drag: { x: false, y: false } },
      };

      const plot = new UPlot(
        options ? options(defaults) : defaults,
        toData(xs, vis),
        container
      );
      plotRef.current = plot;

      observer = new ResizeObserver(() =>
        plot.setSize({ width: container.clientWidth, height })
      );
      observer.observe(container);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
    // x and the series values are synced by the effect below; `structureKey` covers everything else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, options, empty]);

  useEffect(() => {
    if (!empty) plotRef.current?.setData(toData(x, visible));
  }, [x, visible, markers, empty]);

  return (
    <div
      className={className}
      role="img"
      aria-label={text?.ariaLabel ?? text?.title}
    >
      {empty ? (
        <p className="p-8 text-center text-slate-500">
          {text?.empty ?? 'No data to display.'}
        </p>
      ) : (
        <div ref={containerRef} className="w-full" />
      )}
    </div>
  );
}

function toData(x: ChartValues, series: ChartSeries[]): uPlot.AlignedData {
  return [
    Array.from(x) as number[],
    ...series.map((s) => Array.from(s.y) as (number | null)[]),
  ];
}
