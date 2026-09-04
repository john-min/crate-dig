/** Field dust — ordinary dots, no halo. */
export const FIELD_RADIUS_PX = 1.5;
export const FIELD_RADIUS_MIN_PX = 1.25;

/** Seed neighborhood — glow and size reserved for these. */
export const NEIGHBOR_SCORE_MIN = 0.6;
export const NEIGHBOR_RADIUS_MIN_PX = 2.0;
export const NEIGHBOR_RADIUS_MAX_PX = 4.15;
export const GLOW_RADIUS_MULT = 2.65;

export const SEED_RADIUS_PX = 5.5;
export const PLAYING_RADIUS_PX = 5.7;
export const SELECTED_RADIUS_PX = 6.1;

export function isNeighborScore(score: number | null | undefined): boolean {
  return score != null && score >= NEIGHBOR_SCORE_MIN;
}

export function radiusForTrack(score: number | null | undefined): number {
  if (!isNeighborScore(score)) return FIELD_RADIUS_PX;
  const t = Math.max(0, Math.min(1, ((score ?? 0) - NEIGHBOR_SCORE_MIN) / (1 - NEIGHBOR_SCORE_MIN)));
  return NEIGHBOR_RADIUS_MIN_PX + t ** 1.2 * (NEIGHBOR_RADIUS_MAX_PX - NEIGHBOR_RADIUS_MIN_PX);
}

export function glowRadiusForTrack(score: number | null | undefined): number {
  return radiusForTrack(score) * GLOW_RADIUS_MULT;
}
