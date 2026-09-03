import { describe, expect, it } from "vitest";
import { clampQScore, pickQCandidates } from "./candidates";

const tracks = [
  { id: "warm", title: "Warm Roll", bpm: 122 },
  { id: "peak", title: "Peak Steel", bpm: 128 },
  { id: "slow", title: "Slow Room", bpm: 110 },
  { id: "seed", title: "Seed Track", bpm: 122 },
];

describe("pickQCandidates", () => {
  it("prefers visible tracks and BPM-near the prompt", () => {
    const picked = pickQCandidates(tracks, {
      prompt: "Find me warm tracks around 122 BPM.",
      visibleIds: ["slow"],
      seedId: "seed",
      limit: 3,
    });
    expect(picked.map((track) => track.id)).toEqual(["warm", "peak", "slow"]);
    expect(picked).not.toContainEqual(expect.objectContaining({ id: "seed" }));
  });

  it("falls back to the seed when it is the only usable record", () => {
    expect(
      pickQCandidates([{ id: "seed", title: "Only", bpm: 120 }], {
        prompt: "darker nearby",
        seedId: "seed",
      }).map((track) => track.id),
    ).toEqual(["seed"]);
  });
});

describe("clampQScore", () => {
  it("keeps scores inside 0–1 and defaults missing values", () => {
    expect(clampQScore(0.8)).toBe(0.8);
    expect(clampQScore(1.4)).toBe(1);
    expect(clampQScore(null)).toBe(0.5);
  });
});
