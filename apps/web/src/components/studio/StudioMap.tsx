"use client";

import { useMemo, useState } from "react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { formatBpm, formatGenre, formatKey } from "@/lib/studio/format";
import type { MapTrack } from "@/lib/types/track";
import { MapLegend } from "./MapLegend";
import { NoResults } from "./NoResults";
import { MapFallbackList } from "./MapFallbackList";
import { useStudio } from "./StudioProvider";
import type { StudioTrack } from "@/lib/studio/types";

/** Display-only color gradient; not a recommendation or sonic similarity score. */
function prototypeCentroidDisplayScores(tracks: StudioTrack[]): Record<string, number> {
  const n = tracks.length;
  if (!n) return {};
  let cx = 0;
  let cy = 0;
  for (const track of tracks) {
    cx += track.umap_x;
    cy += track.umap_y;
  }
  cx /= n;
  cy /= n;
  const dists = tracks.map((track) => Math.hypot(track.umap_x - cx, track.umap_y - cy));
  const maxDist = Math.max(...dists, 0.001);
  const out: Record<string, number> = {};
  for (let i = 0; i < tracks.length; i++) {
    out[tracks[i].id] = 1 - dists[i] / maxDist;
  }
  return out;
}

export function StudioMap() {
  const s = useStudio();
  const { analysisReady, seed, visible, scoreFor } = s;
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const [hover, setHover] = useState<{ track: MapTrack; x: number; y: number } | null>(null);
  const visibleIds = useMemo(() => new Set(visible.map((t) => t.id)), [visible]);
  const scores = useMemo(() => {
    if (!analysisReady) return {};
    if (!seed) return prototypeCentroidDisplayScores(visible);
    const out: Record<string, number> = {};
    for (const track of visible) {
      const score = scoreFor(track);
      if (score != null) out[track.id] = score;
      else if (track.id === seed.id) out[track.id] = 1;
    }
    return out;
  }, [analysisReady, scoreFor, seed, visible]);

  if (!s.webglOk) return <MapFallbackList />;
  if (s.visible.length === 0) return <NoResults />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <MapCanvas
          tracks={s.tracks as import("@/lib/types/track").MapTrack[]}
          selectedTrackId={s.primarySelected?.id ?? null}
          playingTrackId={s.playing?.id ?? null}
          seedTrackIds={s.seedIds}
          visibleIds={visibleIds}
          colorBy={s.colorBy}
          scores={scores}
          fitRequestKey={fitRequestKey}
          onSelectTrack={(id) => {
            if (id) s.selectTrack(id);
            else s.selectTrack(null);
          }}
          onHoverTrack={(track, point) => {
            if (!track || !point) {
              setHover(null);
              return;
            }
            setHover({ track, x: point.x, y: point.y });
          }}
          onWebgl={s.setWebglOk}
        />
        {hover ? <MapHoverCard hover={hover} /> : null}
        <MapLegend onFit={() => setFitRequestKey((key) => key + 1)} />
        {s.selectedIds.length > 0 ? <SelectionActions /> : null}
      </div>
    </div>
  );
}

function MapHoverCard({ hover }: { hover: { track: MapTrack; x: number; y: number } }) {
  const genre = formatGenre(hover.track.genre);
  const vibe = hover.track.mood?.trim() || "—";
  return (
    <div
      className="pointer-events-none absolute z-20 w-56 rounded-[8px] border border-[#1B1F27] bg-[#0D0F13] px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        left: Math.max(8, hover.x + 14),
        top: Math.max(8, hover.y - 12),
      }}
    >
      <p className="truncate text-[13px] font-medium text-[#EDEFF3]">{hover.track.title}</p>
      <p className="truncate text-[12px] text-[#A6ACB8]">{hover.track.artist}</p>
      <p className="mt-1 text-[11.5px] text-[#7C8698]">
        {formatBpm(hover.track.bpm ?? null)} · {formatKey(hover.track.key)}
      </p>
      <p className="mt-1 truncate text-[11.5px] text-[#A6ACB8]">
        {genre}
        <span className="ml-1.5 rounded-full bg-[#171B21] px-[7px] py-0.5 capitalize">{vibe}</span>
      </p>
    </div>
  );
}

function SelectionActions() {
  const s = useStudio();
  return (
    <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-line bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] px-3 py-2 shadow-[0_14px_36px_rgba(0,0,0,0.42)] backdrop-blur">
      <strong className="mr-1 tabular text-[12.5px] font-semibold text-paper">
        {s.selectedIds.length} selected
      </strong>
      <button type="button" className="cd-selection-action" onClick={s.addSelectedToCrate}>
        Add to crate
      </button>
      <button type="button" className="cd-selection-action" onClick={s.openQ}>
        Ask Q
      </button>
      <button type="button" className="cd-selection-action" onClick={() => s.selectNearest(20)}>
        Select nearest 20
      </button>
      <button
        type="button"
        className="ml-auto text-[12px] text-paper-dim hover:text-paper"
        onClick={() => s.selectTrack(null)}
      >
        Clear
      </button>
    </div>
  );
}
