import { describe, expect, it } from "vitest";
import type { Neighbor, Track } from "@crate-dig/contracts";
import {
  activeFilterCount,
  BPM_BOUNDS,
  bpmBoundsFromTracks,
  mapTrackToStudio,
  matchesStudioFilters,
  orderTracksByNeighbors,
  prototypeDisplayCoordinates,
  prototypeMapDistanceNeighbors,
  type StudioFilters,
  type StudioTrack,
} from "./studio";

function track(
  partial: Partial<Track> & Pick<Track, "id"> & { studio?: Record<string, unknown> },
): Track {
  return {
    libraryId: "lib",
    title: partial.id,
    artist: "Artist",
    ...partial,
  } as Track;
}

function studio(partial: Partial<StudioTrack> & Pick<StudioTrack, "id">): StudioTrack {
  return mapTrackToStudio(
    track({
      id: partial.id,
      title: partial.title ?? partial.id,
      bpm: partial.bpm,
      musicalKey: partial.key ?? undefined,
      studio: {
        key: partial.key,
        genre: partial.genre,
        mood: partial.mood,
        energy: partial.energy,
        textures: partial.textures,
        umap_x: partial.umap_x,
        umap_y: partial.umap_y,
        analysisStatus: partial.analysisStatus,
        cluster: partial.cluster,
        clusterName: partial.clusterName,
      },
    }),
  );
}

const emptyFilters: StudioFilters = {
  query: "",
  bpmMin: BPM_BOUNDS.min,
  bpmMax: BPM_BOUNDS.max,
  keys: [],
  moods: [],
  energies: [],
  textures: [],
  compatibleKeys: false,
  bpmNearSeed: false,
};

describe("prototype display coordinates", () => {
  it("are deterministic and unlabeled as sonic data", () => {
    expect(prototypeDisplayCoordinates("trk-1")).toEqual(prototypeDisplayCoordinates("trk-1"));
    expect(prototypeDisplayCoordinates("trk-1")).not.toEqual(prototypeDisplayCoordinates("trk-2"));
  });
});

describe("mapTrackToStudio", () => {
  it("marks preview missing when no playable URL exists", () => {
    expect(mapTrackToStudio(track({ id: "trk-1" })).previewState).toBe("missing");
    expect(
      mapTrackToStudio(track({ id: "trk-1", previewUrl: "/audio/trk-1" })).previewState,
    ).toBe("ready");
  });

  it("maps completed analysis readiness to ok without artist heuristics", () => {
    const mapped = mapTrackToStudio(
      track({ id: "trk-1", artist: "", readiness: "ready_fast" }),
    );
    expect(mapped.analysisStatus).toBe("ok");
    expect(mapTrackToStudio(track({ id: "trk-2", artist: "DJ", readiness: "queued" })).analysisStatus).toBe(
      "pending",
    );
    expect(mapTrackToStudio(track({ id: "trk-3", artist: "", readiness: "imported" })).analysisStatus).toBe(
      "missing-metadata",
    );
  });

  it("uses backend projection when present instead of prototype geometry", () => {
    const mapped = mapTrackToStudio(track({ id: "trk-1" }), {
      trackId: "trk-1",
      x: 9,
      y: -4,
      clusterId: "12",
      readiness: "ready_fast",
    });
    const fallback = prototypeDisplayCoordinates("trk-1");
    expect(mapped.umap_x).toBe(9);
    expect(mapped.umap_y).toBe(-4);
    expect(mapped.umap_x).not.toBe(fallback.x);
    expect(mapped.clusterName).toBe("Cluster 12");
  });

  it("falls back to prototype geometry when no projection exists", () => {
    const mapped = mapTrackToStudio(track({ id: "trk-1" }));
    expect(mapped.umap_x).toBe(prototypeDisplayCoordinates("trk-1").x);
    expect(mapped.umap_y).toBe(prototypeDisplayCoordinates("trk-1").y);
  });
});

describe("prototypeMapDistanceNeighbors", () => {
  it("labels map-distance ranking as non-sonic prototype output", () => {
    const seed = studio({ id: "seed", umap_x: 0, umap_y: 0, analysisStatus: "ok" });
    const near = studio({ id: "near", umap_x: 0.1, umap_y: 0.1, analysisStatus: "ok" });
    const [neighbor] = prototypeMapDistanceNeighbors(seed, [seed, near], 4);
    expect(neighbor?.component).toBe("prototype-map-distance");
    expect(neighbor?.evidence).toMatchObject({ nonSonic: true });
    expect(neighbor?.trackId).toBe("near");
  });
});

describe("orderTracksByNeighbors", () => {
  it("follows adapter neighbor rank rather than display distance", () => {
    const near = studio({ id: "near", umap_x: 0, umap_y: 0, analysisStatus: "ok" });
    const far = studio({ id: "far", umap_x: 40, umap_y: 40, analysisStatus: "ok" });
    const neighbors: Neighbor[] = [
      { trackId: "far", score: 0.9, component: "effnet" },
      { trackId: "near", score: 0.2, component: "effnet" },
    ];
    expect(orderTracksByNeighbors([near, far], neighbors).map((item) => item.id)).toEqual([
      "far",
      "near",
    ]);
  });
});

describe("bpmBoundsFromTracks", () => {
  it("uses tagged BPM min/max and falls back when none exist", () => {
    expect(bpmBoundsFromTracks([])).toEqual(BPM_BOUNDS);
    expect(bpmBoundsFromTracks([{ bpm: 108 }, { bpm: 150 }, { bpm: null }])).toEqual({
      min: 108,
      max: 150,
    });
    expect(bpmBoundsFromTracks([{ bpm: 122 }])).toEqual({ min: 121, max: 123 });
  });
});

describe("studio filters", () => {
  it("counts active filters and matches query/bpm/key constraints", () => {
    const trackRow = studio({
      id: "a",
      title: "Nocturne Transit",
      bpm: 122,
      key: "7A",
      mood: "warm",
      energy: "medium",
      textures: ["minimal"],
    });
    expect(activeFilterCount(emptyFilters)).toBe(0);
    expect(matchesStudioFilters(trackRow, emptyFilters, null)).toBe(true);
    expect(
      matchesStudioFilters(trackRow, { ...emptyFilters, query: "nocturne" }, null),
    ).toBe(true);
    expect(
      matchesStudioFilters(trackRow, { ...emptyFilters, bpmMin: 128, bpmMax: 132 }, null),
    ).toBe(false);
  });

  it("does not treat the library BPM span as an active filter", () => {
    const bounds = { min: 108, max: 150 };
    const full = { ...emptyFilters, bpmMin: 108, bpmMax: 150 };
    const fast = studio({ id: "fast", title: "Inta", bpm: 150 });
    expect(activeFilterCount(full, bounds)).toBe(0);
    expect(matchesStudioFilters(fast, full, null, bounds)).toBe(true);
    expect(
      matchesStudioFilters(fast, { ...full, bpmMin: 108, bpmMax: 136 }, null, bounds),
    ).toBe(false);
  });
});
