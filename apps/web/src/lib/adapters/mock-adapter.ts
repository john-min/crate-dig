import {
  mapTrackToStudio,
  prototypeMapDistanceNeighbors,
  type StudioTrack,
} from "@crate-dig/app-core";
import type {
  AnalysisRun,
  CreateAnalysisRunInput,
  ImportFolderInput,
  ImportResult,
  ListTracksOptions,
  MockRuntimeAdapter,
  Neighbor,
  NeighborOptions,
  PlaybackUrl,
  Track,
  TrackAnalysis,
} from "@crate-dig/contracts";
import { getMockLibrary } from "../studio/mock-library";

const MOCK_LIBRARY_ID = "mock-library";
const PREVIEW_LIBRARY_ID = "preview-demo";

type PreviewCatalogTrack = {
  id: string;
  libraryId?: string;
  title: string;
  artist: string;
  bpm?: number | null;
  musicalKey?: string;
  studio?: Record<string, unknown>;
};

function fromPreviewCatalogTrack(track: PreviewCatalogTrack): Track {
  return {
    id: track.id,
    libraryId: track.libraryId ?? PREVIEW_LIBRARY_ID,
    title: track.title,
    artist: track.artist,
    readiness: "ready_fast",
    previewUrl: null,
    bpm: track.bpm ?? null,
    musicalKey: track.musicalKey,
    studio: {
      previewState: "ready",
      analysisStatus: "ok",
      suggestedMoment: "R2 demo",
      clusterName: "Unanalyzed",
      ...track.studio,
    },
  } as Track;
}

function toContractTrack(track: Omit<StudioTrack, "libraryId">): Track {
  return {
    id: track.id,
    libraryId: MOCK_LIBRARY_ID,
    title: track.title,
    artist: track.artist,
    readiness: track.analysisStatus === "ok" ? "ready_fast" : "imported",
    previewUrl: track.previewUrl,
    bpm: track.bpm,
    musicalKey: track.key ?? undefined,
    createdAt: track.createdAt,
    studio: {
      key: track.key,
      genre: track.genre,
      mood: track.mood,
      energy: track.energy,
      textures: track.textures,
      durationSec: track.durationSec,
      year: track.year,
      label: track.label,
      cluster: track.cluster,
      clusterName: track.clusterName,
      suggestedMoment: track.suggestedMoment,
      umap_x: track.umap_x,
      umap_y: track.umap_y,
      tags: track.tags,
      analysisStatus: track.analysisStatus,
      previewState: track.previewState,
      loudnessLufs: track.loudnessLufs,
      energyScore: track.energyScore,
    },
  } as Track;
}

export class MockAdapter implements MockRuntimeAdapter {
  readonly runtime = "mock" as const;
  private readonly fixtureTracks: readonly Track[];
  private studioTracks: readonly StudioTrack[];
  private readonly playbackPath?: string;
  private readonly catalogPath?: string;
  private readonly requestFetch: typeof fetch;
  private catalogPromise: Promise<readonly Track[]> | null = null;
  private previewLibrary = {
    id: PREVIEW_LIBRARY_ID,
    name: "Demo library",
    source: "demo" as const,
  };

  constructor(
    options: { playbackPath?: string; catalogPath?: string; fetch?: typeof fetch } = {},
  ) {
    this.fixtureTracks = getMockLibrary().tracks.map((track) =>
      toContractTrack(track as Omit<StudioTrack, "libraryId">),
    );
    this.studioTracks = this.fixtureTracks.map((track) => mapTrackToStudio(track));
    this.playbackPath = options.playbackPath;
    this.catalogPath = options.catalogPath;
    this.requestFetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  private async tracksForMode(): Promise<readonly Track[]> {
    if (!this.catalogPath) return this.fixtureTracks;
    if (!this.catalogPromise) {
      this.catalogPromise = this.fetchCatalog();
    }
    return this.catalogPromise;
  }

  private async fetchCatalog(): Promise<readonly Track[]> {
    const response = await this.requestFetch(this.catalogPath!, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Demo catalog is unavailable.");
    }
    const body = (await response.json()) as {
      library?: { id?: string; name?: string; source?: string };
      tracks?: PreviewCatalogTrack[];
    };
    if (body.library?.id && body.library.name) {
      this.previewLibrary = {
        id: body.library.id,
        name: body.library.name,
        source: "demo",
      };
    }
    const tracks = (body.tracks ?? []).map(fromPreviewCatalogTrack);
    this.studioTracks = tracks.map((track) => mapTrackToStudio(track));
    return tracks;
  }

  async health() {
    return { ok: true, runtime: "fixture" as const, version: "studio-fixture-v1" };
  }

  async listLibraries() {
    if (this.catalogPath) {
      await this.tracksForMode();
      return [this.previewLibrary];
    }
    return [{ id: MOCK_LIBRARY_ID, name: "Demo library", source: "fixture" }];
  }

  async listTracks(options: ListTracksOptions = {}): Promise<readonly Track[]> {
    const tracks = await this.tracksForMode();
    const query = options.query?.trim().toLowerCase();
    const filtered = query
      ? tracks.filter((track) =>
          `${track.title} ${track.artist}`.toLowerCase().includes(query),
        )
      : tracks;
    const offset = options.offset ?? 0;
    return filtered.slice(offset, options.limit == null ? undefined : offset + options.limit);
  }

  async getTrack(trackId: string): Promise<Track> {
    const tracks = await this.tracksForMode();
    const track = tracks.find((item) => item.id === trackId);
    if (!track) throw new Error(`Mock track ${trackId} was not found.`);
    return track;
  }

  async createAnalysisRun(input: CreateAnalysisRunInput): Promise<AnalysisRun> {
    return {
      id: `mock-run-${input.idempotencyKey}`,
      libraryId: input.libraryId,
      status: "complete",
      mode: input.mode,
      manifestName: input.manifestName,
      manifestVersion: input.manifestVersion,
    };
  }

  async getAnalysisRun(runId: string): Promise<AnalysisRun> {
    return { id: runId, libraryId: MOCK_LIBRARY_ID, status: "complete", mode: "fast" };
  }

  async listAnalysisRunTracks(runId: string): Promise<readonly TrackAnalysis[]> {
    const tracks = await this.tracksForMode();
    return tracks.map((track) => ({
      trackId: track.id,
      runId,
      readiness: track.readiness,
    }));
  }

  async cancelAnalysisRun(runId: string): Promise<AnalysisRun> {
    return { id: runId, libraryId: MOCK_LIBRARY_ID, status: "cancelled", mode: "fast" };
  }

  async retryAnalysisStage(): Promise<void> {}

  async getTrackAnalysis(trackId: string, runId?: string): Promise<TrackAnalysis> {
    const track = await this.getTrack(trackId);
    return { trackId, runId, readiness: track.readiness };
  }

  async getTrackNeighbors(
    trackId: string,
    options: NeighborOptions = {},
  ): Promise<readonly Neighbor[]> {
    await this.tracksForMode();
    const seed = this.studioTracks.find((track) => track.id === trackId);
    if (!seed) return [];
    return prototypeMapDistanceNeighbors(seed, this.studioTracks, options.limit);
  }

  async getPlaybackUrl(trackId: string): Promise<PlaybackUrl> {
    if (!this.playbackPath) {
      return { url: "" };
    }
    const url = `${this.playbackPath}?trackId=${encodeURIComponent(trackId)}`;
    try {
      const response = await this.requestFetch(url, { cache: "no-store" });
      if (!response.ok) return { url: "" };
      const body = (await response.json()) as PlaybackUrl;
      return { url: body.url ?? "", expiresAt: body.expiresAt };
    } catch {
      return { url: "" };
    }
  }

  async importFolder(_input: ImportFolderInput): Promise<ImportResult> {
    return { libraryId: MOCK_LIBRARY_ID, outcomes: [] };
  }
}
