/** Map a 0–1 sonic similarity score to a pixel radius. */
export function radiusFromScore(score: number | null | undefined): number {
  const s = Math.max(0, Math.min(1, score ?? 0.42));
  const t = s * s;
  return 2.15 + t * 5.7;
}

export function glowRadiusFromScore(score: number | null | undefined): number {
  return radiusFromScore(score) * 2.45;
}
