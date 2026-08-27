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
  private readonly tracks: readonly Track[];
  private readonly studioTracks: readonly StudioTrack[];

  constructor() {
    this.tracks = getMockLibrary().tracks.map((track) =>
      toContractTrack(track as Omit<StudioTrack, "libraryId">),
    );
    this.studioTracks = this.tracks.map((track) => mapTrackToStudio(track));
  }

  async health() {
    return { ok: true, runtime: "fixture" as const, version: "studio-fixture-v1" };
  }

  async listLibraries() {
    return [{ id: MOCK_LIBRARY_ID, name: "Demo library", source: "fixture" }];
  }

  async listTracks(options: ListTracksOptions = {}): Promise<readonly Track[]> {
    const query = options.query?.trim().toLowerCase();
    const filtered = query
      ? this.tracks.filter((track) =>
          `${track.title} ${track.artist}`.toLowerCase().includes(query),
        )
      : this.tracks;
    const offset = options.offset ?? 0;
    return filtered.slice(offset, options.limit == null ? undefined : offset + options.limit);
  }

  async getTrack(trackId: string): Promise<Track> {
    const track = this.tracks.find((item) => item.id === trackId);
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
    return this.tracks.map((track) => ({
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
    const seed = this.studioTracks.find((track) => track.id === trackId);
    if (!seed) return [];
    return prototypeMapDistanceNeighbors(seed, this.studioTracks, options.limit);
  }

  async getPlaybackUrl(_trackId: string): Promise<PlaybackUrl> {
    // Empty URL keeps mock transport on the deterministic simulated timer.
    return { url: "" };
  }

  async importFolder(_input: ImportFolderInput): Promise<ImportResult> {
    return { libraryId: MOCK_LIBRARY_ID, outcomes: [] };
  }
}
