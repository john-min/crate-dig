import { describe, expect, it } from "vitest";
import { clusterIslands, largestIslands, starMagnitudes } from "./cluster-islands";
import type { PlotTrack } from "./types";

function track(
  id: string,
  cluster: number,
  x: number,
  y: number,
  name = "House",
  energy = "medium",
): PlotTrack {
  return {
    id,
    title: id,
    artist: "x",
    bpm: 120,
    key: "8A",
    mood: "warm",
    energy,
    energyScore: null,
    x,
    y,
    cluster,
    clusterName: name,
    suggestedMoment: "peak",
    raw: {} as PlotTrack["raw"],
  };
}

describe("clusterIslands", () => {
  it("puts the nebula at the centroid and sizes it from inner spread", () => {
    const islands = clusterIslands([
      track("a", 0, 0, 0),
      track("b", 0, 2, 0),
      track("c", 0, 0, 2),
      track("d", 0, 2, 2),
    ]);
    expect(islands).toHaveLength(1);
    expect(islands[0]!.x).toBeCloseTo(1);
    expect(islands[0]!.y).toBeCloseTo(1);
    expect(islands[0]!.n).toBe(4);
    expect(islands[0]!.coreRadius).toBeGreaterThan(0.16);
    expect(islands[0]!.coreRadius).toBeLessThan(1.5);
  });

  it("keeps separate genre islands", () => {
    const islands = clusterIslands([
      track("a", 0, 0, 0, "Acid"),
      track("b", 1, 4, 4, "Techno"),
      track("c", 1, 5, 4, "Techno"),
    ]);
    expect(islands.map((island) => island.name).sort()).toEqual(["ACID", "TECHNO"]);
  });

  it("keeps only the largest islands for labels", () => {
    const labeled = largestIslands(
      clusterIslands([
        track("a", 0, 0, 0, "Tiny"),
        track("b", 1, 4, 0, "Mid"),
        track("c", 1, 5, 0, "Mid"),
        track("d", 2, 8, 0, "Big"),
        track("e", 2, 9, 0, "Big"),
        track("f", 2, 8, 1, "Big"),
      ]),
      2,
    );
    expect(labeled.map((island) => island.name)).toEqual(["BIG", "MID"]);
  });
});

describe("starMagnitudes", () => {
  it("makes the cluster core brighter than the fringe", () => {
    const mags = starMagnitudes([
      track("core", 0, 0, 0, "House", "peak"),
      track("edge", 0, 4, 0, "House", "low"),
    ]);
    expect(mags.get("core")!).toBeGreaterThan(mags.get("edge")!);
  });
});
