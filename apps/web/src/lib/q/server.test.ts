import { describe, expect, it } from "vitest";
import { evidenceFromFilters, filtersFromModel, localOutput, selectedProvider } from "./logic";
import type { ParsedQRequest } from "./schema";

const bounds = { min: 108, max: 150 };

function request(prompt: string): ParsedQRequest {
  return {
    prompt,
    history: [],
    context: {
      libraryName: "Demo",
      librarySource: "preview",
      analysisReady: false,
      seedTrackId: null,
      selectedTrackIds: [],
      bpmBounds: bounds,
      activeCrate: null,
    },
    candidates: [
      {
        id: "a",
        title: "Warm Roll",
        artist: "Test",
        bpm: 122,
        key: "8A",
        genre: "deep house",
        mood: "warm",
        energy: "medium",
        textures: ["percussive"],
        clusterName: "Warm Rollers",
        suggestedMoment: "Warm-up",
        score: 0.5,
      },
      {
        id: "b",
        title: "Peak Steel",
        artist: "Test",
        bpm: 128,
        key: "9A",
        genre: "techno",
        mood: "dark",
        energy: "peak",
        textures: ["raw"],
        clusterName: "Steel Warehouse",
        suggestedMoment: "Peak",
        score: 0.4,
      },
    ],
  };
}

describe("selectedProvider", () => {
  it("uses Groq when a key is present", () => {
    expect(selectedProvider({ GROQ_API_KEY: "gsk_test" })).toBe("groq");
  });

  it("stays local when Q_PROVIDER=local", () => {
    expect(selectedProvider({ Q_PROVIDER: "local", GROQ_API_KEY: "gsk_test" })).toBe("local");
  });

  it("stays local when no key is configured", () => {
    expect(selectedProvider({})).toBe("local");
  });

  it("rejects an unknown Q_PROVIDER", () => {
    expect(() => selectedProvider({ Q_PROVIDER: "openai" })).toThrow(/groq or local/);
  });
});

describe("localOutput", () => {
  it("parses a BPM window and prefers nearby tempos", () => {
    const output = localOutput(request("Find me warm, percussive tracks around 122 BPM."));
    expect(output.filters.bpmMin).toBe(118);
    expect(output.filters.bpmMax).toBe(126);
    expect(output.filters.moods).toEqual(["warm"]);
    expect(output.recommendations[0]?.trackId).toBe("a");
  });
});

describe("filtersFromModel", () => {
  it("clamps inverted BPM to the library span", () => {
    expect(
      filtersFromModel(
        { bpmMin: 156, bpmMax: 150, keys: [], moods: [], textures: [], energies: [] },
        bounds,
      ),
    ).toEqual({ bpmMin: 150, bpmMax: 150 });
  });
});

describe("evidenceFromFilters", () => {
  it("renders BPM and vibe chips", () => {
    expect(evidenceFromFilters({ bpmMin: 118, bpmMax: 126, moods: ["warm"] })).toEqual([
      "118–126 BPM",
      "warm",
    ]);
  });
});
