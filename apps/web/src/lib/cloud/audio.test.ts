import { describe, expect, it } from "vitest";
import { isAllowedAudioType, sanitizeFileName } from "./audio";

describe("cloud audio helpers", () => {
  it("accepts audio content types and sanitizes object names", () => {
    expect(isAllowedAudioType("audio/wav")).toBe(true);
    expect(isAllowedAudioType("application/xml")).toBe(false);
    expect(sanitizeFileName("../../etc/passwd.wav")).toBe("passwd.wav");
    expect(sanitizeFileName("Take 01 (live).aiff")).toBe("Take 01 (live).aiff");
  });
});
