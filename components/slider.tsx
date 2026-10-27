'use client';

import { useId } from 'react';

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
}: SliderProps) {
  const id = useId();
  return (
    <div className="mb-6">
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
