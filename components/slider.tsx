'use client';

import { useId, type Ref } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Digits after the decimal point in the readout. */
  decimals?: number;
  onChange: (value: number) => void;
  /** The whole control (label, readout and track), e.g. to highlight it. */
  ref?: Ref<HTMLDivElement>;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 0,
  onChange,
  ref,
}: SliderProps) {
  const id = useId();
  return (
    <div ref={ref} className="mb-6">
      <label htmlFor={id} className="mb-1 flex justify-between font-medium">
        <span>{label}</span>
        <span className="tabular-nums">
          {value.toFixed(decimals)}
          {unit && ` ${unit}`}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary-600 w-full"
      />
    </div>
  );
}
