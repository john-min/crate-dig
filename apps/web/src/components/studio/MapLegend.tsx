"use client";

import { useStudio } from "./StudioProvider";
import type { ColorBy } from "@/lib/studio/types";

const LEGENDS: Record<ColorBy, Array<{ label: string; color: string }>> = {
  mood: [
    { label: "warm", color: "#E9A63C" },
    { label: "euphoric", color: "#8B7BF0" },
    { label: "dark", color: "#5A8CE8" },
    { label: "dreamy", color: "#A9C64A" },
    { label: "hypnotic", color: "#48BFD4" },
  ],
  cluster: [
    { label: "warm", color: "#E9A63C" },
    { label: "dub", color: "#48BFD4" },
    { label: "peak", color: "#8B7BF0" },
    { label: "raw", color: "#E4705A" },
    { label: "afterhours", color: "#5A8CE8" },
  ],
  energy: [
    { label: "low", color: "#48BFD4" },
    { label: "medium", color: "#E9A63C" },
    { label: "driving", color: "#8B7BF0" },
    { label: "peak", color: "#E4705A" },
  ],
  similarity: [
    { label: "near", color: "#E9A63C" },
    { label: "far", color: "#5B6373" },
  ],
};

export function MapLegend({ onFit }: { onFit: () => void }) {
  const s = useStudio();
  const items = LEGENDS[s.colorBy];

  return (
    <div className="pointer-events-none absolute bottom-[14px] left-4 z-10 flex items-center gap-[11px]">
      <div
        className="pointer-events-auto flex items-center gap-[11px] rounded-[10px] border border-[#1F232B] bg-[#0C0E12E6] px-3 py-[9px]"
        aria-label={`${s.colorBy} color legend`}
      >
        {s.colorBy === "cluster" ? (
          <span className="text-[11.5px] text-[#B7BEC9]">each cluster is a genre</span>
        ) : (
          items.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-[5px] text-[11.5px] text-[#B7BEC9]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} aria-hidden />
              {item.label}
            </span>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onFit}
        className="pointer-events-auto h-7 rounded-[8px] border border-[#1F232B] bg-[#0C0E12E6] px-3 text-[11.5px] text-[#98A0AE] hover:text-[#EDEFF3]"
      >
        Fit to view
      </button>
    </div>
  );
}
