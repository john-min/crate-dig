import { describe, expect, it } from "vitest";
import { layoutGenreIslands } from "./genre-layout";
import { projectPca2d } from "./pca";

describe("layoutGenreIslands", () => {
  it("keeps local scatter and pulls different genres farther apart", () => {
    const laid = layoutGenreIslands([
      { id: "a1", genre: "Techno", x: 0.1, y: 0.2 },
      { id: "a2", genre: "Techno", x: 0.2, y: 0.1 },
      { id: "b1", genre: "Disco", x: 4, y: 4 },
    ]);
    const technoA = laid.get("a1")!;
    const technoB = laid.get("a2")!;
    const disco = laid.get("b1")!;
    expect(technoA.clusterName).toBe("Techno");
    expect(disco.clusterName).toBe("Disco");
    expect(technoA.cluster).not.toBe(disco.cluster);
    const intra = Math.hypot(technoA.x - technoB.x, technoA.y - technoB.y);
    const inter = Math.hypot(technoA.x - disco.x, technoA.y - disco.y);
    expect(intra).toBeGreaterThan(0.05);
    expect(intra).toBeLessThan(1);
    expect(inter).toBeGreaterThan(intra * 8);
  });

  it("packs stacked house genres into non-overlapping islands", () => {
    const genres = [
      "Deep House",
      "Disco House",
      "Funky House",
      "Organic House",
      "Progressive House",
      "Melodic House",
    ];
    const points = genres.flatMap((genre, genreIndex) =>
      Array.from({ length: 12 }, (_, index) => ({
        id: `${genre}-${index}`,
        genre,
        x: 0.04 * Math.cos(index) + genreIndex * 0.01,
        y: 0.04 * Math.sin(index) + genreIndex * 0.008,
      })),
    );
    const laid = layoutGenreIslands(points);
    const islands = genres.map((genre) => {
      const members = points
        .filter((point) => point.genre === genre)
        .map((point) => laid.get(point.id)!);
      const cx = members.reduce((sum, item) => sum + item.x, 0) / members.length;
      const cy = members.reduce((sum, item) => sum + item.y, 0) / members.length;
      const dists = members.map((item) => Math.hypot(item.x - cx, item.y - cy)).sort((a, b) => a - b);
      const radius = dists[Math.floor((dists.length - 1) * 0.9)] ?? 0;
      return { genre, cx, cy, radius };
    });

    for (let i = 0; i < islands.length; i += 1) {
      for (let j = i + 1; j < islands.length; j += 1) {
        const dist = Math.hypot(islands[i].cx - islands[j].cx, islands[i].cy - islands[j].cy);
        expect(dist).toBeGreaterThan(islands[i].radius + islands[j].radius + 0.8);
      }
    }
  });
  it("merges Nu-Disco into Nu Disco", () => {
    const laid = layoutGenreIslands([
      { id: "a", genre: "Nu-Disco", x: 0, y: 0 },
      { id: "b", genre: "Nu Disco", x: 1, y: 0 },
    ]);
    expect(laid.get("a")?.clusterName).toBe("Nu Disco");
    expect(laid.get("b")?.clusterName).toBe("Nu Disco");
    expect(laid.get("a")?.cluster).toBe(laid.get("b")?.cluster);
  });
});

describe("projectPca2d", () => {
  it("separates orthogonal directions", () => {
    const projected = projectPca2d(
      new Map([
        ["x", [2, 0, 0]],
        ["y", [0, 2, 0]],
        ["z", [0, 0, 0]],
      ]),
    );
    const dx = Math.hypot(projected.get("x")!.x, projected.get("x")!.y);
    const dy = Math.hypot(projected.get("y")!.x, projected.get("y")!.y);
    expect(dx).toBeGreaterThan(0.1);
    expect(dy).toBeGreaterThan(0.1);
  });
});
