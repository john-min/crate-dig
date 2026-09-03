const Q_CANDIDATE_LIMIT = 48;

export type QPickableTrack = {
  id: string;
  title: string;
  bpm: number | null;
  analysisStatus?: string;
  hiddenFromRecs?: boolean;
};

function promptBpmCenter(prompt: string): number | null {
  const match =
    prompt.toLowerCase().match(/around\s+(\d{2,3})/) ??
    prompt.toLowerCase().match(/(\d{2,3})\s*bpm/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function pickQCandidates<T extends QPickableTrack>(
  tracks: readonly T[],
  options: {
    prompt: string;
    visibleIds?: readonly string[];
    selectedIds?: readonly string[];
    seedId?: string | null;
    limit?: number;
    scoreFor?: (track: T) => number | null;
  },
): T[] {
  const limit = options.limit ?? Q_CANDIDATE_LIMIT;
  const visible = new Set(options.visibleIds ?? []);
  const selected = new Set(options.selectedIds ?? []);
  const bpmCenter = promptBpmCenter(options.prompt);
  const seedId = options.seedId ?? null;

  const ranked = tracks
    .filter((track) => track.analysisStatus !== "failed" && !track.hiddenFromRecs)
    .map((track) => {
      let rank = 0;
      if (visible.has(track.id)) rank += 3;
      if (selected.has(track.id)) rank += 2;
      if (seedId === track.id) rank += 1;
      if (bpmCenter != null && track.bpm != null) {
        const delta = Math.abs(track.bpm - bpmCenter);
        if (delta <= 4) rank += 8;
        else if (delta <= 8) rank += 4;
        else if (delta <= 12) rank += 1;
      }
      const similarity = options.scoreFor?.(track);
      if (similarity != null) rank += similarity * 4;
      return { track, rank };
    })
    .sort((a, b) => b.rank - a.rank || a.track.title.localeCompare(b.track.title))
    .map((item) => item.track);

  const others = seedId ? ranked.filter((track) => track.id !== seedId) : ranked;
  const pool = others.length ? others : ranked;
  return pool.slice(0, Math.max(1, limit));
}

export function clampQScore(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
