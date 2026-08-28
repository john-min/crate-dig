import { describe, expect, it } from "vitest";
import { interpretQPrompt, looksLikeQAsk } from "./q-intent";

describe("looksLikeQAsk", () => {
  it("treats lexical queries as search", () => {
    expect(looksLikeQAsk("nocturne")).toBe(false);
    expect(looksLikeQAsk("Anaïs Kerr")).toBe(false);
  });

  it("detects intent sentences", () => {
    expect(looksLikeQAsk("Find me warm, percussive tracks around 122 BPM.")).toBe(true);
    expect(looksLikeQAsk("raise energy after this track")).toBe(true);
  });
});

describe("interpretQPrompt", () => {
  it("extracts BPM window, mood, and texture", () => {
    const { filters, evidence } = interpretQPrompt(
      "Find me warm, percussive tracks around 122 BPM.",
    );
    expect(filters.bpmMin).toBe(118);
    expect(filters.bpmMax).toBe(126);
    expect(filters.moods).toEqual(["warm"]);
    expect(filters.textures).toEqual(["percussive"]);
    expect(evidence[0]).toBe("122 BPM ±4");
  });

  it("clamps a BPM window to the library span", () => {
    const { filters } = interpretQPrompt("around 148 BPM", { min: 108, max: 150 });
    expect(filters.bpmMin).toBe(144);
    expect(filters.bpmMax).toBe(150);
  });
});
