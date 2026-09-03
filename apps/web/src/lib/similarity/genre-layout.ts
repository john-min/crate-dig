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

const LOCAL_RADIUS = 2.15;
const ISLAND_GAP = 9;

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
  const count = Math.max(genres.length, 1);
  const ring = Math.max(10, (count * ISLAND_GAP) / (2 * Math.PI));
  const out = new Map<string, LaidOutTrack>();

  genres.forEach((genreKey, cluster) => {
    const group = groups.get(genreKey);
    const members = group?.members ?? [];
    const genre = group?.name ?? genreKey;
    const angle = (2 * Math.PI * cluster) / count - Math.PI / 2;
    const cx = Math.cos(angle) * ring;
    const cy = Math.sin(angle) * ring;
    if (members.length === 1) {
      out.set(members[0]!.id, { x: cx, y: cy, cluster, clusterName: genre });
      return;
    }

    let mx = 0;
    let my = 0;
    for (const member of members) {
      mx += member.x;
      my += member.y;
    }
    mx /= members.length;
    my /= members.length;

    let maxR = 0.001;
    const local = members.map((member) => {
      const lx = member.x - mx;
      const ly = member.y - my;
      maxR = Math.max(maxR, Math.hypot(lx, ly));
      return { member, lx, ly };
    });
    const scale = LOCAL_RADIUS / maxR;
    for (const item of local) {
      out.set(item.member.id, {
        x: cx + item.lx * scale,
        y: cy + item.ly * scale,
        cluster,
        clusterName: genre,
      });
    }
  });

  return out;
}
