import type { Neighbor, ProjectionPoint, Track } from "@crate-dig/contracts";
import {
  analysisStatusFromReadiness,
  previewStateFromUrl,
} from "./analysis";

export type Energy = "low" | "medium" | "peak" | "driving";
export type Texture = "raw" | "atmospheric" | "minimal" | "percussive" | "vocal";
export type Mood = "warm" | "euphoric" | "dark" | "dreamy" | "hypnotic";
export type AnalysisStatus = "ok" | "pending" | "failed" | "missing-metadata" | "duplicate";
export type PreviewState = "ready" | "missing" | "failed" | "expired";

export interface StudioTrack extends Track {
  bpm: number | null;
  musicalKey?: string;
  key: string | null;
  genre: string;
  mood: Mood;
  energy: Energy;
  textures: Texture[];
  durationSec: number;
  year: number;
  label: string;
  cluster: number;
  clusterName: string;
  suggestedMoment: string;
  umap_x: number;
  umap_y: number;
  tags: string[];
  analysisStatus: AnalysisStatus;
  previewState: PreviewState;
  loudnessLufs: number | null;
  energyScore: number | null;
  hiddenFromRecs?: boolean;
  createdAt?: string;
}

export type StudioFilters = {
  query: string;
  bpmMin: number;
  bpmMax: number;
  keys: string[];
  moods: Mood[];
  energies: Energy[];
  textures: Texture[];
  compatibleKeys: boolean;
  bpmNearSeed: boolean;
};

export type SimilarityReason = {
  label: string;
  kind: "shared" | "distance" | "compatible" | "warning";
};

export type BpmBounds = { min: number; max: number };

export const BPM_BOUNDS: BpmBounds = { min: 108, max: 136 };

export function bpmBoundsFromTracks(tracks: readonly { bpm?: number | null }[]): BpmBounds {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const track of tracks) {
    const bpm = track.bpm;
    if (bpm == null || !Number.isFinite(bpm)) continue;
    const low = Math.floor(bpm);
    const high = Math.ceil(bpm);
    if (low < min) min = low;
    if (high > max) max = high;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: BPM_BOUNDS.min, max: BPM_BOUNDS.max };
  }
  if (min === max) {
    return { min: Math.max(1, min - 1), max: min + 1 };
  }
  return { min, max };
}

export function isBpmFilterActive(
  filters: Pick<StudioFilters, "bpmMin" | "bpmMax">,
  bounds: BpmBounds = BPM_BOUNDS,
): boolean {
  return filters.bpmMin > bounds.min || filters.bpmMax < bounds.max;
}

const VALID_MOODS = new Set<Mood>(["warm", "euphoric", "dark", "dreamy", "hypnotic"]);
const VALID_ENERGIES = new Set<Energy>(["low", "medium", "peak", "driving"]);
const VALID_TEXTURES = new Set<Texture>([
  "raw",
  "atmospheric",
  "minimal",
  "percussive",
  "vocal",
]);

type StudioTrackMetadata = Partial<Omit<StudioTrack, keyof Track>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function metadataFor(track: Track): StudioTrackMetadata {
  const value = (track as Track & { studio?: unknown }).studio;
  return isRecord(value) ? (value as StudioTrackMetadata) : {};
}

function readMood(value: unknown): Mood {
  return typeof value === "string" && VALID_MOODS.has(value as Mood) ? (value as Mood) : "warm";
}

function readEnergy(value: unknown): Energy {
  return typeof value === "string" && VALID_ENERGIES.has(value as Energy)
    ? (value as Energy)
    : "medium";
}

function readTextures(value: unknown): Texture[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Texture =>
          typeof item === "string" && VALID_TEXTURES.has(item as Texture),
      )
    : ["minimal"];
}

/**
 * Deterministic display layout for records that do not have a backend projection.
 * This is prototype geometry only: it carries no sonic or recommendation meaning.
 */
export function prototypeDisplayCoordinates(trackId: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let index = 0; index < trackId.length; index += 1) {
    hash = Math.imul(hash ^ trackId.charCodeAt(index), 16777619);
  }
  const unsigned = hash >>> 0;
  const angle = ((unsigned % 360) * Math.PI) / 180;
  const radius = 1.8 + (unsigned % 80) / 50;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function mapTrackToStudio(
  track: Track,
  projection?: ProjectionPoint,
): StudioTrack {
  const metadata = metadataFor(track);
  const fallback = prototypeDisplayCoordinates(track.id);
  const key = track.musicalKey ?? null;
  const readiness = track.readiness;
  const analysisStatus: AnalysisStatus =
    metadata.analysisStatus ??
    analysisStatusFromReadiness(readiness, !track.artist.trim());

  return {
    ...track,
    bpm: track.bpm ?? null,
    key: metadata.key ?? key,
    genre: metadata.genre ?? "",
    mood: readMood(metadata.mood),
    energy: readEnergy(metadata.energy),
    textures: readTextures(metadata.textures),
    durationSec: metadata.durationSec ?? 0,
    year: metadata.year ?? 0,
    label: metadata.label ?? "",
    cluster: metadata.cluster ?? Number(projection?.clusterId ?? 0),
    clusterName: metadata.clusterName ?? (projection?.clusterId ? `Cluster ${projection.clusterId}` : "Unanalyzed"),
    suggestedMoment: metadata.suggestedMoment ?? "Local file",
    umap_x: projection?.x ?? metadata.umap_x ?? fallback.x,
    umap_y: projection?.y ?? metadata.umap_y ?? fallback.y,
    tags: metadata.tags ?? [],
    analysisStatus,
    previewState: metadata.previewState ?? previewStateFromUrl(track.previewUrl),
    loudnessLufs: metadata.loudnessLufs ?? null,
    energyScore: metadata.energyScore ?? null,
    hiddenFromRecs: metadata.hiddenFromRecs,
    createdAt: track.createdAt,
  };
}

export function activeFilterCount(
  filters: StudioFilters,
  bounds: BpmBounds = BPM_BOUNDS,
): number {
  let count = 0;
  if (filters.query.trim()) count += 1;
  if (isBpmFilterActive(filters, bounds)) count += 1;
  if (filters.keys.length) count += 1;
  if (filters.moods.length) count += 1;
  if (filters.energies.length) count += 1;
  if (filters.textures.length) count += 1;
  if (filters.compatibleKeys) count += 1;
  if (filters.bpmNearSeed) count += 1;
  return count;
}

function camelotNeighbors(key: string | null): string[] {
  if (!key) return [];
  const match = key.match(/^(\d{1,2})([AB])$/);
  if (!match) return [];
  const number = Number(match[1]);
  const letter = match[2]!;
  const previous = number === 1 ? 12 : number - 1;
  const next = number === 12 ? 1 : number + 1;
  const other = letter === "A" ? "B" : "A";
  return [`${previous}${letter}`, `${next}${letter}`, `${number}${other}`];
}

export function keysCompatible(left: string | null, right: string | null): boolean {
  return Boolean(left && right && (left === right || camelotNeighbors(left).includes(right)));
}

export function matchesStudioFilters(
  track: StudioTrack,
  filters: StudioFilters,
  seed: StudioTrack | null,
  bounds: BpmBounds = BPM_BOUNDS,
): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const haystack =
      `${track.title} ${track.artist} ${track.label} ${track.genre} ${track.mood} ${track.clusterName}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (track.bpm != null) {
    if (track.bpm < filters.bpmMin || track.bpm > filters.bpmMax) return false;
  } else if (isBpmFilterActive(filters, bounds)) {
    return false;
  }
  if (filters.keys.length && (!track.key || !filters.keys.includes(track.key))) return false;
  if (filters.moods.length && !filters.moods.includes(track.mood)) return false;
  if (filters.energies.length && !filters.energies.includes(track.energy)) return false;
  if (filters.textures.length && !filters.textures.some((item) => track.textures.includes(item))) {
    return false;
  }
  if (filters.compatibleKeys && seed) {
    if (!track.key || !keysCompatible(seed.key, track.key)) return false;
  }
  if (filters.bpmNearSeed && seed?.bpm != null) {
    if (track.bpm == null || Math.abs(track.bpm - seed.bpm) > 4) return false;
  }
  return true;
}

export function orderTracksByNeighbors(
  tracks: readonly StudioTrack[],
  neighbors: readonly Neighbor[],
): StudioTrack[] {
  const rank = new Map(neighbors.map((neighbor, index) => [neighbor.trackId, index]));
  return tracks
    .filter((track) => rank.has(track.id) && !track.hiddenFromRecs)
    .sort((left, right) => rank.get(left.id)! - rank.get(right.id)!);
}

/**
 * Prototype-only fixture helper. Production recommendation ordering must come
 * from CrateDigAdapter.getTrackNeighbors(), never from display coordinates.
 */
export function prototypeMapDistanceNeighbors(
  seed: StudioTrack,
  tracks: readonly StudioTrack[],
  limit = 24,
): Neighbor[] {
  return tracks
    .filter((track) => track.id !== seed.id && track.analysisStatus !== "failed")
    .map((track) => ({
      trackId: track.id,
      score: Math.max(
        0,
        Math.round(
          (1 - Math.min(1, Math.hypot(seed.umap_x - track.umap_x, seed.umap_y - track.umap_y) / 4.8)) *
            100,
        ) / 100,
      ),
      component: "prototype-map-distance",
      evidence: { nonSonic: true },
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export {
  analysisStatusFromReadiness,
  displaySimilarityReasons,
  neighborIsNonSonic,
  neighborReasonCopy,
  previewStateFromUrl,
  readinessFromAnalysisEvidence,
  readinessFromTrackAnalysis,
} from "./analysis";
