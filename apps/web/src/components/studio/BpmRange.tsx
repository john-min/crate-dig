"use client";

import { useCallback, useId, useRef } from "react";

type Props = {
  min: number;
  max: number;
  lo: number;
  hi: number;
  onChange: (next: { lo: number; hi: number }) => void;
};

export function BpmRange({ min, max, lo, hi, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<"lo" | "hi" | null>(null);
  const labelId = useId();
  const span = Math.max(1, max - min);
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return lo;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(min + ratio * span);
    },
    [lo, min, span],
  );

  const move = useCallback(
    (clientX: number) => {
      const value = valueFromClientX(clientX);
      const which = drag.current;
      if (which === "lo") onChange({ lo: Math.min(value, hi), hi });
      if (which === "hi") onChange({ lo, hi: Math.max(value, lo) });
    },
    [hi, lo, onChange, valueFromClientX],
  );

  const start = (which: "lo" | "hi", event: React.PointerEvent) => {
    drag.current = which;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <div
      ref={trackRef}
      className="relative h-6"
      aria-labelledby={labelId}
      onPointerMove={(event) => {
        if (drag.current) move(event.clientX);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div className="absolute inset-x-0 top-[11px] h-0.5 bg-[#20242C]" />
      <div
        className="absolute top-[11px] h-0.5 bg-[#E9A63C]"
        style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
      />
      <button
        type="button"
        aria-valuemin={min}
        aria-valuemax={hi}
        aria-valuenow={lo}
        aria-label="Minimum BPM"
        role="slider"
        className="absolute top-1.5 h-[13px] w-[13px] -ml-[6.5px] rounded-full bg-[#EDEFF3] shadow-[0_0_0_3px_#0F1116]"
        style={{ left: `${loPct}%` }}
        onPointerDown={(event) => start("lo", event)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onChange({ lo: Math.max(min, lo - 1), hi });
          if (event.key === "ArrowRight") onChange({ lo: Math.min(hi, lo + 1), hi });
        }}
      />
      <button
        type="button"
        aria-valuemin={lo}
        aria-valuemax={max}
        aria-valuenow={hi}
        aria-label="Maximum BPM"
        role="slider"
        className="absolute top-1.5 h-[13px] w-[13px] -ml-[6.5px] rounded-full bg-[#EDEFF3] shadow-[0_0_0_3px_#0F1116]"
        style={{ left: `${hiPct}%` }}
        onPointerDown={(event) => start("hi", event)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onChange({ lo, hi: Math.max(lo, hi - 1) });
          if (event.key === "ArrowRight") onChange({ lo, hi: Math.min(max, hi + 1) });
        }}
      />
      <span id={labelId} className="sr-only">
        BPM range
      </span>
    </div>
  );
}
