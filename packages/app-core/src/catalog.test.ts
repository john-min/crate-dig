import { describe, expect, it } from "vitest";
import type { Track } from "@crate-dig/contracts";
import {
  energyFromLevel,
  mapLocalCatalogTrack,
  moodFromGenre,
  normalizeCamelotKey,
  studioFieldsFromCatalog,
} from "./catalog";

describe("catalog studio fields", () => {
  it("normalizes Camelot keys and Rekordbox energy/genre the same way preview does", () => {
    expect(normalizeCamelotKey("09A")).toBe("9A");
    expect(moodFromGenre("Progressive House")).toBe("euphoric");
    expect(energyFromLevel(7)).toBe("peak");
    const studio = studioFieldsFromCatalog({
      genre: "Progressive House",
      key: "09A",
      bpm: 125,
      energyLevel: 7,
      label: "Anjunadeep",
      cluster: 3,
      clusterName: "round & warm · 122 BPM",
      suggestedMoment: "Sunset / golden hour",
      umapX: 1.25,
      umapY: -0.4,
    });
    expect(studio).toMatchObject({
      key: "9A",
      genre: "Progressive House",
      energy: "peak",
      energyScore: 7,
      mood: "euphoric",
      cluster: 3,
      clusterName: "round & warm · 122 BPM",
      suggestedMoment: "Sunset / golden hour",
      umap_x: 1.25,
      umap_y: -0.4,
      analysisStatus: "ok",
    });
  });

  it("does not invent cluster names when analysis did not supply one", () => {
    const studio = studioFieldsFromCatalog({
      genre: "Deep House",
      fallbackMoment: "Local file",
    });
    expect(studio.clusterName).toBe("Deep House");
    expect(studio.suggestedMoment).toBe("Local file");
  });

  it("labels unnamed analysis clusters by index instead of inventing copy", () => {
    expect(
      studioFieldsFromCatalog({
        cluster: 4,
        umapX: 0.2,
        umapY: 0.1,
      }).clusterName,
    ).toBe("Cluster 4");
  });
});

describe("mapLocalCatalogTrack", () => {
  it("carries Cloud Run projection onto the contract track without a second analysis fetch", () => {
    const track = mapLocalCatalogTrack(
      {
        id: "trk-1",
        library_id: "lib-1",
        title: "Don't Slip",
        artist: "1905",
        genre: "G-House",
        label: "Former City",
        bpm: 139,
        key: "11A",
        duration_sec: 209,
        energy_rating: 5,
        umap_x: 2.1,
        umap_y: 0.4,
        cluster_index: 1,
        cluster_name: "bright & driving · 139 BPM",
        suggested_moment: "Peak time",
        analysis_state: "completed",
        created_at: "2026-08-15T00:00:00Z",
        preview_url: "/audio/trk-1",
        location: "/Music/dont-slip.mp3",
      },
      { previewUrl: "http://127.0.0.1:8000/audio/trk-1" },
    );
    expect(track.readiness).toBe("ready_fast");
    expect((track as Track & { studio?: Record<string, unknown> }).studio).toMatchObject({
      cluster: 1,
      clusterName: "bright & driving · 139 BPM",
      suggestedMoment: "Peak time",
      umap_x: 2.1,
      umap_y: 0.4,
      energy: "driving",
      mood: "hypnotic",
      previewState: "ready",
      analysisStatus: "ok",
    });
  });
});
