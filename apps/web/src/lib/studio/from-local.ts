import type { DiskTrack } from "./local-api";
import { LOCAL_API_URL } from "./local-api";
import type { StudioTrack } from "./types";

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Placeholder layout until local analysis exists. Not sonic similarity. */
function placeholderCoords(id: string): { x: number; y: number } {
  const h = hash(id);
  const angle = ((h % 360) * Math.PI) / 180;
  const radius = 1.8 + (h % 80) / 50;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function diskTrackToStudio(row: DiskTrack): StudioTrack {
  const { x, y } = placeholderCoords(row.id);
  const previewUrl = row.preview_url ? `${LOCAL_API_URL}${row.preview_url}` : null;
  return {
    id: row.id,
    title: row.title || row.location.split("/").pop() || "Untitled",
    artist: row.artist || "Unknown artist",
    bpm: null,
    key: null,
    genre: "",
    mood: "warm",
    energy: "medium",
    textures: ["minimal"],
    durationSec: row.duration_sec ?? 0,
    year: 0,
    label: "",
    cluster: 0,
    clusterName: "Unanalyzed",
    suggestedMoment: "Local file",
    umap_x: x,
    umap_y: y,
    tags: ["local"],
    analysisStatus: row.artist ? "ok" : "missing-metadata",
    previewState: row.missing ? "missing" : "ready",
    loudnessLufs: null,
    energyScore: null,
    previewUrl,
  };
}
