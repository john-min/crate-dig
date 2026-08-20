import type { MapTrack } from "@/lib/types/track";
import type { PlotTrack } from "./types";

function parseCluster(track: MapTrack): number {
  if (typeof track.cluster === "number" && Number.isFinite(track.cluster)) {
    return track.cluster;
  }
  if (track.clusterId == null || track.clusterId === "") return -1;
  const parsed = Number.parseInt(String(track.clusterId), 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

export function toPlotTrack(track: MapTrack): PlotTrack | null {
  const x = track.umap_x ?? track.x;
  const y = track.umap_y ?? track.y;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const cluster = parseCluster(track);
  return {
    id: track.id,
    title: track.title || "Untitled",
    artist: track.artist || "Unknown artist",
    bpm: typeof track.bpm === "number" && Number.isFinite(track.bpm) ? track.bpm : null,
    key: track.key ?? "",
    mood: track.mood || "warm",
    x,
    y,
    cluster,
    clusterName: track.clusterName || (cluster < 0 ? "Outliers / one-offs" : `Cluster ${cluster}`),
    suggestedMoment: track.suggestedMoment ?? "",
    raw: {
      ...track,
      x,
      y,
      umap_x: x,
      umap_y: y,
      cluster,
      clusterId: track.clusterId ?? String(cluster),
      mood: track.mood || "warm",
      clusterName: track.clusterName,
    },
  };
}

export function toPlotTracks(tracks: MapTrack[]): PlotTrack[] {
  const out: PlotTrack[] = [];
  for (const track of tracks) {
    const plotted = toPlotTrack(track);
    if (plotted) out.push(plotted);
  }
  return out;
}

export type SyntheticFixture = {
  version?: number;
  source?: string;
  count?: number;
  tracks: MapTrack[];
};
