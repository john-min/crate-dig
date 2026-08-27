"use client";

import type { ColorBy, PlotTrack } from "./types";
import { formatBpm, formatKey } from "@/lib/studio/format";
import { waveformPeaks } from "@/lib/studio/waveform";
import { Waveform } from "@/components/studio/Waveform";

type Props = {
  colorBy: ColorBy;
  onColorBy: (value: ColorBy) => void;
  visibleCount: number;
  totalCount: number;
  usingFixture: boolean;
  hover: { x: number; y: number; track: PlotTrack } | null;
  onFit: () => void;
};

export function MapOverlays({
  colorBy,
  onColorBy,
  hover,
  onFit,
}: Props) {
  return (
    <>
      {hover ? (
        <div
          className="pointer-events-none absolute z-20 w-56 rounded-[var(--radius-md)] border border-line bg-[var(--panel)] px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          style={{
            left: Math.min(hover.x + 14, 10000),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="truncate text-[13px] font-medium text-paper">{hover.track.title}</p>
          <p className="truncate text-[12px] text-paper-dim">{hover.track.artist}</p>
          <p className="mt-1 font-data text-[11.5px] text-muted">
            {formatBpm(hover.track.bpm)} BPM · {formatKey(hover.track.key)}
          </p>
          <Waveform className="mt-2 h-6" peaks={waveformPeaks(hover.track.id, 48)} label="" />
        </div>
      ) : null}

      <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-2">
        <div className="inline-flex rounded-[var(--radius-md)] border border-line bg-[var(--panel)] p-0.5">
          {(["mood", "cluster", "energy", "similarity"] as ColorBy[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onColorBy(value)}
              className={`h-7 rounded-[6px] px-2.5 text-[12px] capitalize ${
                colorBy === value ? "bg-[var(--control)] text-paper" : "text-muted hover:text-paper"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFit}
          className="h-7 rounded-[var(--radius-md)] border border-line bg-[var(--panel)] px-2 text-[12px] text-paper-dim hover:text-paper"
        >
          Fit
        </button>
      </div>
    </>
  );
}
