import { describe, expect, it } from "vitest";
import { hasPlayableAudioObject, pickPlaybackObjectKey } from "./playback-object";

describe("pickPlaybackObjectKey", () => {
  it("returns null when no objects exist", () => {
    expect(pickPlaybackObjectKey(null)).toBeNull();
    expect(pickPlaybackObjectKey([])).toBeNull();
    expect(hasPlayableAudioObject([])).toBe(false);
  });

  it("prefers preview over original so the browser does not stream the master", () => {
    expect(
      pickPlaybackObjectKey([
        { kind: "original", object_key: "libraries/lib/originals/a.wav" },
        { kind: "preview", object_key: "libraries/lib/previews/a.mp3" },
      ]),
    ).toBe("libraries/lib/previews/a.mp3");
  });

  it("falls back to original and ignores waveform/artifact-only rows", () => {
    expect(
      pickPlaybackObjectKey([{ kind: "original", object_key: "libraries/lib/originals/a.wav" }]),
    ).toBe("libraries/lib/originals/a.wav");
    expect(
      pickPlaybackObjectKey([{ kind: "waveform", object_key: "libraries/lib/waveforms/a.json" }]),
    ).toBeNull();
    expect(hasPlayableAudioObject([{ kind: "original", object_key: "key" }])).toBe(true);
  });
});
