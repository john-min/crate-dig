import { camelotNeighbors } from "./format";
import type { StudioFilters, StudioTrack } from "./types";
import { BPM_BOUNDS } from "./constants";

export function activeFilterCount(filters: StudioFilters): number {
  let n = 0;
  if (filters.query.trim()) n += 1;
  if (filters.bpmMin > BPM_BOUNDS.min || filters.bpmMax < BPM_BOUNDS.max) n += 1;
  if (filters.keys.length) n += 1;
  if (filters.moods.length) n += 1;
  if (filters.energies.length) n += 1;
  if (filters.textures.length) n += 1;
  if (filters.compatibleKeys) n += 1;
  if (filters.bpmNearSeed) n += 1;
  return n;
}

export function matchesStudioFilters(
  track: StudioTrack,
  filters: StudioFilters,
  seed: StudioTrack | null,
): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q) {
    const hay = `${track.title} ${track.artist} ${track.label} ${track.genre} ${track.mood} ${track.clusterName}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (track.bpm != null) {
    if (track.bpm < filters.bpmMin || track.bpm > filters.bpmMax) return false;
  } else if (filters.bpmMin > BPM_BOUNDS.min || filters.bpmMax < BPM_BOUNDS.max) {
    return false;
  }
  if (filters.keys.length && (!track.key || !filters.keys.includes(track.key))) return false;
  if (filters.moods.length && !filters.moods.includes(track.mood)) return false;
  if (filters.energies.length && !filters.energies.includes(track.energy)) return false;
  if (filters.textures.length && !filters.textures.some((t) => track.textures.includes(t))) {
    return false;
  }
  if (filters.compatibleKeys && seed) {
    if (!track.key) return false;
    const allowed = new Set([seed.key, ...camelotNeighbors(seed.key)].filter(Boolean) as string[]);
    if (!allowed.has(track.key)) return false;
  }
  if (filters.bpmNearSeed && seed?.bpm != null) {
    if (track.bpm == null || Math.abs(track.bpm - seed.bpm) > 4) return false;
  }
  return true;
}
