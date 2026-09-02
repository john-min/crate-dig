import { describe, expect, it } from "vitest";
import { mapTrackToStudio, type StudioTrack } from "@crate-dig/app-core";
import type { Track } from "@crate-dig/contracts";
import {
  EMPTY_FILTERS,
  qDockBody,
  qDockHeadline,
  qDockState,
  visibleStudioTracks,
} from "../renderer/studio/view";

function track(partial: Partial<Track> & Pick<Track, "id">): StudioTrack {
  return mapTrackToStudio({
    libraryId: "lib-1",
    title: "Untitled",
    artist: "Unknown",
    createdAt: "2026-09-01T00:00:00Z",
    ...partial,
  });
}

describe("desktop studio view", () => {
  it("keeps Q copy honest when the library or neighbors are missing", () => {
    expect(qDockHeadline(qDockState({
      trackCount: 0,
      selected: null,
      neighbors: [],
      listening: false,
      channel: "librosa-zscore-v1",
    }))).toMatch(/waiting for a local library/i);
    expect(qDockBody(qDockState({
      trackCount: 1,
      selected: track({ id: "a", title: "Undertow Pattern" }),
      neighbors: [],
      listening: false,
      channel: "librosa-zscore-v1",
    }))).toMatch(/left empty/i);
    expect(qDockHeadline(qDockState({
      trackCount: 1,
      selected: track({ id: "a", title: "Undertow Pattern" }),
      neighbors: [{ trackId: "b", score: 0.9, component: "librosa-zscore-v1" }],
      listening: false,
      channel: "librosa-zscore-v1",
    }))).toBe("Q found 1 nearby records");
  });

  it("filters the library without inventing extra records", () => {
    const tracks = [
      track({ id: "warm", title: "Warm", bpm: 120 }),
      track({ id: "fast", title: "Fast", bpm: 132 }),
    ];
    const visible = visibleStudioTracks(
      tracks,
      { ...EMPTY_FILTERS, bpmMin: 118, bpmMax: 124, query: "warm" },
      null,
      "all",
      new Set(),
    );
    expect(visible.map((item) => item.id)).toEqual(["warm"]);
  });
});
