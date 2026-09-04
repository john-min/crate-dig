import { describe, expect, it } from "vitest";
import { FIELD_RADIUS_PX, isNeighborScore, radiusForTrack } from "./radius";

describe("radiusForTrack", () => {
  it("keeps field dots at the dust floor", () => {
    expect(radiusForTrack(null)).toBe(FIELD_RADIUS_PX);
    expect(radiusForTrack(0.4)).toBe(FIELD_RADIUS_PX);
    expect(isNeighborScore(0.4)).toBe(false);
  });

  it("grows only neighbors above the score threshold", () => {
    expect(isNeighborScore(0.6)).toBe(true);
    expect(radiusForTrack(1)).toBeGreaterThan(radiusForTrack(0.7));
    expect(radiusForTrack(0.7)).toBeGreaterThan(FIELD_RADIUS_PX);
  });
});
