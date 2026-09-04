import { describe, expect, it } from "vitest";
import { neighbourhoodFor } from "./neighbourhood";
import type { StudioTrack } from "./types";

function track(id: string, cluster: number, name: string, x: number, y: number): StudioTrack {
  return {
    id,
    libraryId: "t",
    title: id,
    artist: "x",
    bpm: 120,
    key: "8A",
    genre: name,
    mood: "warm",
    energy: "medium",
    textures: ["minimal"],
    durationSec: 300,
    year: 2021,
    label: "Foldwave",
    cluster,
    clusterName: name,
    suggestedMoment: "peak",
    umap_x: x,
    umap_y: y,
    tags: ["warm"],
    analysisStatus: "ok",
    previewState: "ready",
    loudnessLufs: -8,
    energyScore: 7,
  };
}

describe("neighbourhoodFor", () => {
  it("names the home island and the nearest other cluster", () => {
    const home = track("a", 0, "Warm Rollers", 0, 0);
    const place = neighbourhoodFor(home, [
      home,
      track("b", 0, "Warm Rollers", 0.2, 0),
      track("c", 1, "Afterhours Deep", 3, 0),
      track("d", 2, "Neon Peak", 9, 9),
    ]);
    expect(place.home).toBe("Warm Rollers");
    expect(place.shared).toBe(2);
    expect(place.lean).toBe("Afterhours Deep");
  });
});
