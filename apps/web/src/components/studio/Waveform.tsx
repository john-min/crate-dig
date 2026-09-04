"use client";

export function Waveform({
  peaks,
  progress = 0,
  className = "",
  label,
}: {
  peaks: number[];
  progress?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      className={`h-10 w-full ${className}`}
      viewBox={`0 0 ${peaks.length} 32`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? "Waveform preview"}
    >
      {peaks.map((p, i) => {
        const h = Math.max(2, p * 28);
        const y = 16 - h / 2;
        const on = i / peaks.length <= progress;
        return (
          <rect
            key={i}
            x={i + 0.15}
            y={y}
            width={0.7}
            height={h}
            rx={0.15}
            fill={on ? "#E9A63C" : "rgba(247,249,255,0.22)"}
          />
        );
      })}
    </svg>
  );
}

export function EnergyCurve({
  peaks,
  className = "",
}: {
  peaks: number[];
  className?: string;
}) {
  const w = Math.max(peaks.length - 1, 1);
  const line = peaks
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i} ${(1 - p) * 28 + 2}`)
    .join(" ");
  const area = `${line} L ${w} 30 L 0 30 Z`;
  return (
    <svg
      className={`h-[72px] w-full ${className}`}
      viewBox={`0 0 ${peaks.length} 32`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Energy curve"
    >
      <path d={area} fill="rgba(233,166,60,0.22)" />
      <path d={line} fill="none" stroke="#E9A63C" strokeWidth="1.15" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
