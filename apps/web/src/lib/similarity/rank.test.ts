import { describe, expect, it } from "vitest";
import { prepareLibrosaCorpus, rankCosineNeighbors, zscoreNormalize } from "./rank";

describe("librosa neighbor ranking", () => {
  it("ranks the nearer z-scored vector first", () => {
    const raw = new Map<string, number[]>([
      ["a", [1, 0, 0]],
      ["b", [0.9, 0.1, 0]],
      ["c", [0, 1, 0]],
    ]);
    const ranked = rankCosineNeighbors("a", prepareLibrosaCorpus(raw), 2);
    expect(ranked.map((item) => item.trackId)).toEqual(["b", "c"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
    expect(ranked[0]!.rank).toBe(1);
  });

  it("zero-variance dimensions collapse to 0", () => {
    const raw = new Map<string, number[]>([
      ["a", [3, 1]],
      ["b", [3, 2]],
    ]);
    const z = zscoreNormalize(raw);
    expect(z.get("a")![0]).toBe(0);
    expect(z.get("b")![0]).toBe(0);
  });
});
