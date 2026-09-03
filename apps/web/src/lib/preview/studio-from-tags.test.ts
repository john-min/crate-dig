import { describe, expect, it } from "vitest";
import {
  energyFromLevel,
  moodFromGenre,
  normalizeCamelotKey,
  normalizeGenre,
  previewCatalogTrackFromTags,
  studioFieldsFromPreviewTags,
} from "./studio-from-tags";

describe("studioFieldsFromPreviewTags", () => {
  it("normalizes Camelot keys and maps Rekordbox energy/genre", () => {
    expect(normalizeCamelotKey("09A")).toBe("9A");
    expect(moodFromGenre("Progressive House")).toBe("euphoric");
    expect(energyFromLevel(7)).toBe("peak");
    const studio = studioFieldsFromPreviewTags({
      genre: "Progressive House",
      key: "09A",
      bpm: 125,
      energyLevel: 7,
      rating: 3,
      label: "Anjunadeep",
    });
    expect(studio).toMatchObject({
      key: "9A",
      genre: "Progressive House",
      energy: "peak",
      energyScore: 7,
      mood: "euphoric",
      analysisStatus: "ok",
    });
    expect(studio.tags[0]).toBe("Progressive House");
  });

  it("merges Nu-Disco spellings into Nu Disco", () => {
    expect(normalizeGenre("Nu-Disco")).toBe("Nu Disco");
    expect(normalizeGenre("nu disco")).toBe("Nu Disco");
    expect(studioFieldsFromPreviewTags({ genre: "Nu-Disco" }).genre).toBe("Nu Disco");
  });

  it("attaches ID3 studio fields onto a catalog entry", () => {
    const track = previewCatalogTrackFromTags(
      { id: "r2-abc", title: "Fallback Title", artist: "Fallback Artist" },
      {
        title: "Murder Weapon",
        artist: "16 Bit Lolitas",
        genre: "Progressive House",
        key: "09A",
        bpm: 125,
        energyLevel: 7,
      },
    );
    expect(track).toMatchObject({
      id: "r2-abc",
      title: "Murder Weapon",
      artist: "16 Bit Lolitas",
      bpm: 125,
      musicalKey: "9A",
      studio: {
        energy: "peak",
        mood: "euphoric",
        previewState: "ready",
      },
    });
  });
});
