import { describe, expect, it } from "vitest";
import { readPreviewCrateState, serializePreviewCrateState } from "./preview-crates";
import type { Crate } from "./types";

const session: Crate = {
  id: "session",
  name: "Session",
  trackIds: ["t1"],
  intention: "Preview",
  room: "Main",
  timeOfDay: "Now",
};

describe("readPreviewCrateState", () => {
  it("selects a restored crate when a legacy session array is stored", () => {
    const restored = readPreviewCrateState(JSON.stringify([session]), "warm-up");
    expect(restored?.crates).toEqual([session]);
    expect(restored?.activeCrateId).toBe("session");
  });

  it("keeps a versioned active crate id", () => {
    const peak: Crate = { ...session, id: "peak", name: "Peak" };
    const raw = serializePreviewCrateState([session, peak], "peak");
    const restored = readPreviewCrateState(raw, "warm-up");
    expect(restored?.activeCrateId).toBe("peak");
  });

  it("falls back when the stored active id is missing", () => {
    const raw = serializePreviewCrateState([session], "warm-up");
    const restored = readPreviewCrateState(raw, "warm-up");
    expect(restored?.activeCrateId).toBe("session");
  });
});
