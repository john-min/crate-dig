"use client";

import { useStudio } from "./StudioProvider";
import type { ColorBy } from "@/lib/studio/types";

const LEGENDS: Record<ColorBy, Array<{ label: string; color: string }>> = {
  mood: [
    { label: "warm", color: "var(--amber)" },
    { label: "euphoric", color: "var(--violet)" },
    { label: "dark", color: "var(--blue)" },
    { label: "dreamy", color: "var(--lime)" },
    { label: "hypnotic", color: "var(--cyan)" },
  ],
  cluster: [
    { label: "warm", color: "var(--amber)" },
    { label: "dub", color: "var(--cyan)" },
    { label: "peak", color: "var(--violet)" },
    { label: "raw", color: "var(--coral)" },
    { label: "afterhours", color: "var(--blue)" },
  ],
  energy: [
    { label: "low", color: "var(--cyan)" },
    { label: "medium", color: "var(--amber)" },
    { label: "driving", color: "var(--violet)" },
    { label: "peak", color: "var(--coral)" },
  ],
  similarity: [
    { label: "near", color: "var(--amber)" },
    { label: "far", color: "var(--ink-faint)" },
  ],
};

export function MapLegend({ onFit }: { onFit: () => void }) {
  const s = useStudio();
  const items = LEGENDS[s.colorBy];

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--hairline)] bg-[var(--panel)] px-4 py-1.5">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
        Legend <span className="font-normal text-paper-dim">— color: {s.colorBy}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3" aria-label={`${s.colorBy} color legend`}>
        {items.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-paper-dim">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} aria-hidden />
            {item.label}
          </span>
        ))}
      </div>
      <span className="text-[11.5px] text-muted">
        Size: similarity · {s.visible.length.toLocaleString()} records
      </span>
      <div className="ml-auto flex items-center">
        <button
          type="button"
          onClick={onFit}
          className="h-7 rounded-[var(--radius-md)] border border-line bg-ink px-3 text-[11.5px] text-paper-dim hover:text-paper"
        >
          Fit to view
        </button>
      </div>
    </div>
  );
}
