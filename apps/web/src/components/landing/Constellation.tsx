const STARS: Array<{ x: number; y: number; r: number; glow?: boolean }> = [
  { x: 8, y: 22, r: 1.2 },
  { x: 14, y: 48, r: 0.8 },
  { x: 18, y: 71, r: 1.4, glow: true },
  { x: 24, y: 33, r: 0.7 },
  { x: 29, y: 58, r: 1.1 },
  { x: 36, y: 18, r: 0.9 },
  { x: 41, y: 42, r: 1.6, glow: true },
  { x: 47, y: 67, r: 0.8 },
  { x: 53, y: 29, r: 1.2 },
  { x: 58, y: 51, r: 2.1, glow: true },
  { x: 63, y: 76, r: 0.9 },
  { x: 69, y: 38, r: 1.3 },
  { x: 74, y: 61, r: 0.7 },
  { x: 79, y: 24, r: 1.0 },
  { x: 84, y: 47, r: 1.5, glow: true },
  { x: 89, y: 70, r: 0.8 },
  { x: 93, y: 35, r: 1.1 },
];

const LINKS: Array<[number, number]> = [
  [0, 3],
  [3, 6],
  [6, 8],
  [6, 9],
  [9, 11],
  [9, 13],
  [11, 14],
  [2, 4],
  [4, 9],
  [14, 16],
];

export function Constellation({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <g style={{ animation: "drift 18s ease-in-out infinite alternate" }}>
        {LINKS.map(([a, b], i) => (
          <line
            key={i}
            x1={STARS[a].x}
            y1={STARS[a].y}
            x2={STARS[b].x}
            y2={STARS[b].y}
            stroke="oklch(0.93 0.016 82 / 0.12)"
            strokeWidth="0.15"
          />
        ))}
        {STARS.map((star, i) => (
          <circle
            key={i}
            cx={star.x}
            cy={star.y}
            r={star.r * 0.35}
            fill={star.glow ? "oklch(0.79 0.11 78)" : "oklch(0.93 0.016 82 / 0.72)"}
          />
        ))}
      </g>
    </svg>
  );
}
