/** Camelot-wheel neighbors: ±1 number, and relative major/minor. */
export function camelotNeighbors(key: string | null | undefined): string[] {
  if (!key) return [];
  const match = key.trim().toUpperCase().match(/^(\d{1,2})(A|B)$/);
  if (!match) return [];
  const n = Number(match[1]);
  if (n < 1 || n > 12) return [];
  const letter = match[2] as "A" | "B";
  const prev = n === 1 ? 12 : n - 1;
  const next = n === 12 ? 1 : n + 1;
  const other = letter === "A" ? "B" : "A";
  return [`${prev}${letter}`, `${next}${letter}`, `${n}${other}`];
}

export function keysCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = a.toUpperCase();
  const right = b.toUpperCase();
  if (left === right) return true;
  return camelotNeighbors(left).includes(right);
}

export function formatBpm(bpm: number | null | undefined): string {
  if (bpm == null || !Number.isFinite(bpm)) return "—";
  return String(Math.round(bpm));
}

export function formatKey(key: string | null | undefined): string {
  return key && key.trim() ? key : "—";
}

export function formatGenre(genre: string | null | undefined): string {
  return genre?.trim() || "—";
}

export function uniqueGenres(tracks: readonly { genre: string }[], limit?: number): string[] {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    const genre = track.genre.trim();
    if (!genre) continue;
    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) =>
    left[0].localeCompare(right[0], undefined, { sensitivity: "base" }),
  );
  return (limit != null ? ranked.slice(0, limit) : ranked).map(([genre]) => genre);
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return score.toFixed(2);
}
