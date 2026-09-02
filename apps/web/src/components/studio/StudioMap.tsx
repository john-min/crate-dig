"use client";

import { useMemo, useState } from "react";
import { MapCanvas } from "@/components/map/MapCanvas";
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
          onWebgl={s.setWebglOk}
        />
        <MapLegend onFit={() => setFitRequestKey((key) => key + 1)} />
        {s.selectedIds.length > 0 ? <SelectionActions /> : null}
      </div>
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
