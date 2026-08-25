"use client";

import { useMemo } from "react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { MapLegend } from "./MapLegend";
import { ClusterExplanationCard } from "./ClusterExplanationCard";
import { NoResults } from "./NoResults";
import { MapFallbackList } from "./MapFallbackList";
import { useStudio } from "./StudioProvider";
import { docksQ, useBreakpoint } from "@/lib/studio/use-breakpoint";
import { similarityScore } from "@/lib/studio/similarity";
import type { StudioTrack } from "@/lib/studio/types";

function centroidScores(tracks: StudioTrack[]): Record<string, number> {
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
  const bp = useBreakpoint();
  const visibleIds = useMemo(() => new Set(s.visible.map((t) => t.id)), [s.visible]);
  const scores = useMemo(() => {
    const origin = s.seed ?? s.primarySelected;
    if (!origin) return centroidScores(s.visible);
    const out: Record<string, number> = {};
    for (const track of s.visible) {
      out[track.id] = track.id === origin.id ? 1 : similarityScore(origin, track);
    }
    return out;
  }, [s.seed, s.primarySelected, s.visible]);

  if (!s.webglOk) return <MapFallbackList />;
  if (s.visible.length === 0) return <NoResults />;

  return (
    <div className="relative min-h-0 flex-1">
      <MapCanvas
        tracks={s.tracks as import("@/lib/types/track").MapTrack[]}
        selectedTrackId={s.primarySelected?.id ?? null}
        playingTrackId={s.playing?.id ?? null}
        seedTrackIds={s.seedIds}
        visibleIds={visibleIds}
        colorBy={s.colorBy}
        scores={scores}
        onColorBy={s.setColorBy}
        onSelectTrack={(id) => {
          if (id) {
            if (!docksQ(bp)) s.closeQ();
            s.openDrawer(id);
          } else s.selectTrack(null);
        }}
        onWebgl={s.setWebglOk}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 z-10">
        <MapLegend />
      </div>
      <div className="pointer-events-none absolute left-3 top-14 z-10">
        <ClusterExplanationCard />
      </div>
    </div>
  );
}
