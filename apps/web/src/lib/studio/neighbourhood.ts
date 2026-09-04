import type { StudioTrack } from "./types";

export type Neighbourhood = {
  home: string;
  lean: string | null;
  shared: number;
};

/** Nearest other genre island, from this track's map position. */
export function neighbourhoodFor(
  track: StudioTrack,
  tracks: readonly StudioTrack[],
): Neighbourhood {
  const centroids = new Map<number, { name: string; x: number; y: number; n: number }>();
  for (const candidate of tracks) {
    if (candidate.cluster < 0) continue;
    const cur = centroids.get(candidate.cluster);
    if (cur) {
      cur.x += candidate.umap_x;
      cur.y += candidate.umap_y;
      cur.n += 1;
    } else {
      centroids.set(candidate.cluster, {
        name: candidate.clusterName,
        x: candidate.umap_x,
        y: candidate.umap_y,
        n: 1,
      });
    }
  }

  let lean: string | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const [cluster, group] of centroids) {
    if (cluster === track.cluster || group.n === 0) continue;
    const cx = group.x / group.n;
    const cy = group.y / group.n;
    const dist = Math.hypot(track.umap_x - cx, track.umap_y - cy);
    if (dist < best) {
      best = dist;
      lean = group.name;
    }
  }

  const shared = centroids.get(track.cluster)?.n ?? 0;
  return { home: track.clusterName || "Unlabeled", lean, shared };
}
