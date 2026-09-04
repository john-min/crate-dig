import { normalizeGenre } from "@/lib/preview/studio-from-tags";

export type GenreLayoutPoint = {
  id: string;
  genre: string;
  x: number;
  y: number;
};

export type LaidOutTrack = {
  x: number;
  y: number;
  cluster: number;
  clusterName: string;
};

type Island = {
  key: string;
  name: string;
  cluster: number;
  mass: number;
  radius: number;
  x: number;
  y: number;
  members: { id: string; lx: number; ly: number }[];
};

/** Seed from sonic neighborhood, then pack so genre circles do not overlap. */
const GENRE_SPREAD = 2.8;
const MIN_RADIUS = 0.55;
const ISLAND_GAP = 1.85;
const PACK_ITERS = 180;
const PACK_DAMPING = 0.55;
const PACK_EPS = 1e-4;

export function layoutGenreIslands(points: readonly GenreLayoutPoint[]): Map<string, LaidOutTrack> {
  const groups = new Map<string, { name: string; members: GenreLayoutPoint[] }>();
  for (const point of points) {
    const name = normalizeGenre(point.genre) || "Unlabeled";
    const key = name.toLowerCase();
    const group = groups.get(key);
    if (group) group.members.push(point);
    else groups.set(key, { name, members: [point] });
  }

  const genres = [...groups.keys()].sort((left, right) =>
    (groups.get(left)?.name ?? left).localeCompare(groups.get(right)?.name ?? right, undefined, {
      sensitivity: "base",
    }),
  );

  let gx = 0;
  let gy = 0;
  for (const point of points) {
    gx += point.x;
    gy += point.y;
  }
  const n = Math.max(points.length, 1);
  gx /= n;
  gy /= n;

  const islands: Island[] = [];
  genres.forEach((genreKey, cluster) => {
    const group = groups.get(genreKey);
    const members = group?.members ?? [];
    const name = group?.name ?? genreKey;
    if (members.length === 0) return;

    let cx = 0;
    let cy = 0;
    for (const member of members) {
      cx += member.x - gx;
      cy += member.y - gy;
    }
    cx /= members.length;
    cy /= members.length;

    const locals = members.map((member) => ({
      id: member.id,
      lx: member.x - gx - cx,
      ly: member.y - gy - cy,
    }));
    const dists = locals.map((local) => Math.hypot(local.lx, local.ly)).sort((a, b) => a - b);
    const radius = Math.max(MIN_RADIUS, quantile(dists, 0.9) * 1.08);

    const angle = hashAngle(genreKey);
    islands.push({
      key: genreKey,
      name,
      cluster,
      mass: Math.max(1, members.length),
      radius,
      x: cx * GENRE_SPREAD + Math.cos(angle) * 0.45,
      y: cy * GENRE_SPREAD + Math.sin(angle) * 0.45,
      members: locals,
    });
  });

  packIslands(islands);

  const out = new Map<string, LaidOutTrack>();
  for (const island of islands) {
    for (const member of island.members) {
      out.set(member.id, {
        x: island.x + member.lx,
        y: island.y + member.ly,
        cluster: island.cluster,
        clusterName: island.name,
      });
    }
  }
  return out;
}

function packIslands(islands: Island[]) {
  if (islands.length < 2) return;

  for (let iter = 0; iter < PACK_ITERS; iter += 1) {
    let maxOverlap = 0;
    for (let i = 0; i < islands.length; i += 1) {
      for (let j = i + 1; j < islands.length; j += 1) {
        const a = islands[i];
        const b = islands[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius + ISLAND_GAP;
        if (dist >= minDist) continue;

        if (dist < PACK_EPS) {
          const angle = hashAngle(`${a.key}|${b.key}`);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = PACK_EPS;
        }

        const overlap = minDist - dist;
        maxOverlap = Math.max(maxOverlap, overlap);
        const nx = dx / dist;
        const ny = dy / dist;
        const mass = a.mass + b.mass;
        const push = overlap * PACK_DAMPING;
        a.x -= nx * push * (b.mass / mass);
        a.y -= ny * push * (b.mass / mass);
        b.x += nx * push * (a.mass / mass);
        b.y += ny * push * (a.mass / mass);
      }
    }
    if (maxOverlap < 0.03) break;
  }
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

function hashAngle(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) / 0x100000000) * Math.PI * 2;
}
