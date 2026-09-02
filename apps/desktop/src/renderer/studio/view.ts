import {
  BPM_BOUNDS,
  bpmBoundsFromTracks,
  matchesStudioFilters,
  type BpmBounds,
  type StudioFilters,
  type StudioTrack,
} from "@crate-dig/app-core";
import type { Neighbor } from "@crate-dig/contracts";

export type LibraryView = "all" | "recent" | "unplayed";

export const EMPTY_FILTERS: StudioFilters = {
  query: "",
  bpmMin: BPM_BOUNDS.min,
  bpmMax: BPM_BOUNDS.max,
  keys: [],
  moods: [],
  energies: [],
  textures: [],
  compatibleKeys: false,
  bpmNearSeed: false,
};

export function filterLibrary(
  tracks: readonly StudioTrack[],
  view: LibraryView,
  playedIds: ReadonlySet<string>,
  now = Date.now(),
): StudioTrack[] {
  if (view === "unplayed") return tracks.filter((track) => !playedIds.has(track.id));
  if (view === "recent") {
    const week = now - 7 * 24 * 60 * 60 * 1000;
    return tracks.filter((track) => {
      if (!track.createdAt) return true;
      const parsed = Date.parse(track.createdAt);
      return Number.isFinite(parsed) && parsed >= week;
    });
  }
  return [...tracks];
}

export function visibleStudioTracks(
  tracks: readonly StudioTrack[],
  filters: StudioFilters,
  seed: StudioTrack | null,
  view: LibraryView,
  playedIds: ReadonlySet<string>,
  bounds: BpmBounds = bpmBoundsFromTracks(tracks),
): StudioTrack[] {
  return filterLibrary(tracks, view, playedIds).filter((track) =>
    matchesStudioFilters(track, filters, seed, bounds),
  );
}

export type QDockState =
  | { kind: "need-library" }
  | { kind: "need-selection" }
  | { kind: "listening"; title: string }
  | { kind: "found"; title: string; count: number }
  | { kind: "empty"; title: string; channel: string };

export function qDockState(options: {
  trackCount: number;
  selected: StudioTrack | null;
  neighbors: readonly Neighbor[] | null;
  listening: boolean;
  channel: string;
}): QDockState {
  if (options.trackCount === 0) return { kind: "need-library" };
  if (!options.selected) return { kind: "need-selection" };
  if (options.listening) return { kind: "listening", title: options.selected.title };
  if (options.neighbors && options.neighbors.length > 0) {
    return { kind: "found", title: options.selected.title, count: options.neighbors.length };
  }
  return { kind: "empty", title: options.selected.title, channel: options.channel };
}

export function qDockHeadline(state: QDockState): string {
  switch (state.kind) {
    case "need-library":
      return "Q is waiting for a local library";
    case "need-selection":
      return "Q is waiting for a selected record";
    case "listening":
      return `Q is listening around ${state.title}…`;
    case "found":
      return `Q found ${state.count} nearby records`;
    case "empty":
      return `No ${state.channel} neighbors yet`;
  }
}

export function qDockBody(state: QDockState): string {
  switch (state.kind) {
    case "need-library":
      return "Import a folder. Q does not invent nearby records or crate copy.";
    case "need-selection":
      return "Select a track. Neighbors come from the local sidecar after analysis, not from map distance.";
    case "listening":
      return "Requesting the versioned neighbor channel from the loopback API.";
    case "found":
      return "These scores are from the local neighbor channel. Missing analysis stays empty.";
    case "empty":
      return "Missing analysis is left empty rather than filled with invented sonic copy.";
  }
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function formatBpm(bpm: number | null | undefined): string {
  return bpm == null || !Number.isFinite(bpm) ? "—" : String(Math.round(bpm));
}

export function formatKey(key: string | null | undefined): string {
  return key?.trim() || "—";
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  return formatClock(seconds);
}
