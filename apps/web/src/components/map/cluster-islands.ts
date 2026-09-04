import type { PlotTrack } from "./types";
import { clusterRgb } from "./colors";

export type ClusterIsland = {
  cluster: number;
  name: string;
  x: number;
  y: number;
  n: number;
  color: [number, number, number];
  /** Median distance from centroid — sizes the inner nebula, not the whole island. */
  coreRadius: number;
};

type Acc = {
  name: string;
  xs: number[];
  ys: number[];
  color: [number, number, number];
};

export function clusterIslands(tracks: readonly PlotTrack[]): ClusterIsland[] {
  const groups = new Map<number, Acc>();
  for (const track of tracks) {
    if (track.cluster < 0) continue;
    const cur = groups.get(track.cluster);
    if (cur) {
      cur.xs.push(track.x);
      cur.ys.push(track.y);
    } else {
      groups.set(track.cluster, {
        name: track.clusterName.toUpperCase(),
        xs: [track.x],
        ys: [track.y],
        color: clusterRgb(track.cluster),
      });
    }
  }

  const islands: ClusterIsland[] = [];
  for (const [cluster, group] of groups) {
    const n = group.xs.length;
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i += 1) {
      x += group.xs[i]!;
      y += group.ys[i]!;
    }
    x /= n;
    y /= n;

    const dists = group.xs
      .map((px, i) => Math.hypot(px - x, group.ys[i]! - y))
      .sort((a, b) => a - b);
    const coreRadius = Math.max(quantile(dists, 0.52), 0.16);

    islands.push({ cluster, name: group.name, x, y, n, color: group.color, coreRadius });
  }
  return islands;
}

export function largestIslands(islands: readonly ClusterIsland[], limit: number): ClusterIsland[] {
  return [...islands].sort((left, right) => right.n - left.n).slice(0, limit);
}

const ENERGY_LEVEL: Record<string, number> = {
  low: 0.2,
  medium: 0.46,
  driving: 0.74,
  peak: 0.96,
};

/** 0–1 visual weight: cluster-core tracks read as brighter, larger stars. */
export function starMagnitudes(tracks: readonly PlotTrack[]): Map<string, number> {
  const groups = new Map<number, PlotTrack[]>();
  for (const track of tracks) {
    const list = groups.get(track.cluster) ?? [];
    list.push(track);
    groups.set(track.cluster, list);
  }

  const out = new Map<string, number>();
  for (const members of groups.values()) {
    let cx = 0;
    let cy = 0;
    for (const member of members) {
      cx += member.x;
      cy += member.y;
    }
    cx /= members.length;
    cy /= members.length;
    const dists = members.map((member) => Math.hypot(member.x - cx, member.y - cy));
    const maxDist = Math.max(...dists, 0.001);
    for (let i = 0; i < members.length; i += 1) {
      const member = members[i]!;
      const centrality = 1 - dists[i]! / maxDist;
      const energy =
        member.energyScore != null
          ? Math.max(0, Math.min(1, member.energyScore / 10))
          : (ENERGY_LEVEL[member.energy] ?? 0.46);
      const mag = 0.07 + 0.5 * centrality ** 1.2 + 0.31 * energy + 0.12 * hash01(member.id);
      out.set(member.id, Math.max(0.05, Math.min(1, mag)));
    }
  }
  return out;
}

function hash01(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 0x100000000;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo] ?? 0;
  const lower = sorted[lo] ?? 0;
  const upper = sorted[hi] ?? lower;
  return lower * (hi - index) + upper * (index - lo);
}
