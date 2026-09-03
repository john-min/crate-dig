/** Exact cosine ranking after optional corpus z-score. Matches local-api zscore-v1. */

export type RankedNeighbor = {
  trackId: string;
  rank: number;
  score: number;
  distance: number;
};

export function zscoreNormalize(vectors: ReadonlyMap<string, readonly number[]>): Map<string, number[]> {
  const ids = [...vectors.keys()].sort();
  if (ids.length === 0) return new Map();
  const dimensions = vectors.get(ids[0]!)!.length;
  const means = Array.from({ length: dimensions }, (_, index) => {
    let sum = 0;
    for (const id of ids) sum += vectors.get(id)![index]!;
    return sum / ids.length;
  });
  const deviations = Array.from({ length: dimensions }, (_, index) => {
    let sum = 0;
    for (const id of ids) {
      const delta = vectors.get(id)![index]! - means[index]!;
      sum += delta * delta;
    }
    return Math.sqrt(sum / ids.length);
  });

  const out = new Map<string, number[]>();
  for (const [id, values] of vectors) {
    out.set(
      id,
      values.map((value, index) => {
        const deviation = deviations[index]!;
        return deviation === 0 ? 0 : (value - means[index]!) / deviation;
      }),
    );
  }
  return out;
}

export function l2Normalize(values: readonly number[]): number[] | null {
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return null;
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) return null;
  return values.map((value) => value / norm);
}

export function rankCosineNeighbors(
  sourceId: string,
  vectors: ReadonlyMap<string, readonly number[]>,
  limit: number,
): RankedNeighbor[] {
  const source = vectors.get(sourceId);
  if (!source || limit <= 0) return [];
  const scored: Array<{ trackId: string; score: number }> = [];
  for (const [trackId, target] of vectors) {
    if (trackId === sourceId) continue;
    let score = 0;
    for (let index = 0; index < source.length; index += 1) {
      score += source[index]! * target[index]!;
    }
    score = Math.min(1, Math.max(-1, score));
    scored.push({ trackId, score });
  }
  scored.sort((left, right) => right.score - left.score || left.trackId.localeCompare(right.trackId));
  return scored.slice(0, limit).map((item, index) => ({
    trackId: item.trackId,
    rank: index + 1,
    score: item.score,
    distance: 1 - item.score,
  }));
}

export function prepareLibrosaCorpus(
  raw: ReadonlyMap<string, readonly number[]>,
): Map<string, number[]> {
  const zscored = zscoreNormalize(raw);
  const prepared = new Map<string, number[]>();
  for (const [id, values] of zscored) {
    const unit = l2Normalize(values);
    if (unit) prepared.set(id, unit);
  }
  return prepared;
}
