"use client";

import { useStudio } from "./StudioProvider";

export function MapLegend() {
  const s = useStudio();
  const label =
    s.colorBy === "mood"
      ? "COLOUR = MOOD"
      : s.colorBy === "energy"
        ? "COLOUR = ENERGY"
        : s.colorBy === "similarity"
          ? "COLOUR = SIMILARITY"
          : "COLOUR = CLUSTER";

  return (
    <p className="pointer-events-none font-data text-[11.5px] tracking-[0.1em] text-paper-dim uppercase">
      {label}
      <span className="text-paper-dim"> · SIZE = SIMILARITY</span>
      <span className="ml-2 text-paper">· {s.visible.length.toLocaleString()}</span>
    </p>
  );
}
