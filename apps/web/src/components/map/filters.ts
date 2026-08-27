import type { MapFilters, PlotTrack } from "./types";

export const BPM_BOUNDS = { min: 108, max: 136 } as const;

export function matchesFilters(track: PlotTrack, filters: MapFilters | undefined): boolean {
  if (!filters) return true;
  const bpm = track.bpm;
  if (filters.bpmMin != null && (bpm == null || bpm < filters.bpmMin)) return false;
  if (filters.bpmMax != null && (bpm == null || bpm > filters.bpmMax)) return false;
  if (filters.clusters && filters.clusters.length > 0 && !filters.clusters.includes(track.cluster)) {
    return false;
  }
  if (filters.moods && filters.moods.length > 0) {
    const allowed = new Set(filters.moods.map((m) => m.toLowerCase()));
    if (!allowed.has(track.mood.toLowerCase())) return false;
  }
  return true;
}

function intersectOrOne<T>(a?: T[] | null, b?: T[] | null, normalize?: (v: T) => T): T[] | null | undefined {
  const left = a?.length ? a : undefined;
  const right = b?.length ? b : undefined;
  if (!left) return right;
  if (!right) return left;
  const rightSet = new Set(normalize ? right.map(normalize) : right);
  return left.filter((item) => rightSet.has(normalize ? normalize(item) : item));
}

/** Combine parent chrome filters with map-local controls (AND). */
export function mergeFilters(parent?: MapFilters, local?: MapFilters): MapFilters {
  const bpmMin =
    parent?.bpmMin != null && local?.bpmMin != null
      ? Math.max(parent.bpmMin, local.bpmMin)
      : (local?.bpmMin ?? parent?.bpmMin);
  const bpmMax =
    parent?.bpmMax != null && local?.bpmMax != null
      ? Math.min(parent.bpmMax, local.bpmMax)
      : (local?.bpmMax ?? parent?.bpmMax);
  return {
    bpmMin,
    bpmMax,
    clusters: intersectOrOne(parent?.clusters, local?.clusters),
    moods: intersectOrOne(parent?.moods, local?.moods, (m) => m.toLowerCase()),
  };
}

export function toggleInList<T>(list: T[] | null | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}
