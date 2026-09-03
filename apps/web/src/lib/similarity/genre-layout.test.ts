import { describe, expect, it } from "vitest";
import { layoutGenreIslands } from "./genre-layout";
import { projectPca2d } from "./pca";

describe("layoutGenreIslands", () => {
  it("keeps genres far apart and members near their island", () => {
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
    expect(intra).toBeLessThan(5);
    expect(inter).toBeGreaterThan(intra * 3);
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
