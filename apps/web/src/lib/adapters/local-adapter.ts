import {
  analysisStatusFromReadiness,
  previewStateFromUrl,
  readinessFromAnalysisEvidence,
} from "@crate-dig/app-core";
import type {
  AnalysisRun,
  CreateAnalysisRunInput,
  ImportFolderInput,
  ImportResult,
  Library,
  ListTracksOptions,
  LocalRuntimeAdapter,
  Neighbor,
  NeighborOptions,
  PlaybackUrl,
  Track,
  TrackAnalysis,
  components,
} from "@crate-dig/contracts";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import { AdapterError, normalizeAdapterError } from "./errors";

type LocalTrack = components["schemas"]["TrackResponse"];
type LocalAnalysisRun = components["schemas"]["AnalysisRunResponse"];
type LocalTrackAnalysis = components["schemas"]["TrackAnalysisResponse"];
type LocalRunTrack = components["schemas"]["AnalysisRunTrackResponse"];

export interface LocalAdapterOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

type StudioFields = {
  key: string | null;
  genre: string;
  label: string;
  durationSec: number;
  mood: "warm";
  energy: "medium";
  textures: ["minimal"];
  cluster: number;
  clusterName: string;
  suggestedMoment: string;
  tags: string[];
  analysisStatus: ReturnType<typeof analysisStatusFromReadiness>;
  previewState: ReturnType<typeof previewStateFromUrl>;
  loudnessLufs: null;
  energyScore: null;
};

function mapLibrary(row: components["schemas"]["LibraryResponse"]): Library {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrack(row: LocalTrack, baseUrl: string, analysis?: TrackAnalysis | null): Track {
  const previewUrl = row.preview_url ? new URL(row.preview_url, `${baseUrl}/`).toString() : null;
  const readiness = analysis
    ? readinessFromTrackOrEvidence(analysis)
    : "imported";
  const studio: StudioFields = {
    key: row.key,
    genre: row.genre,
    label: row.label,
    durationSec: row.duration_sec ?? 0,
    mood: "warm",
    energy: "medium",
    textures: ["minimal"],
    cluster: 0,
    clusterName: "Unanalyzed",
    suggestedMoment: "Local file",
    tags: ["local"],
    analysisStatus: analysisStatusFromReadiness(readiness, !row.artist.trim()),
    previewState: previewStateFromUrl(previewUrl),
    loudnessLufs: null,
    energyScore: null,
  };
  return {
    id: row.id,
    libraryId: row.library_id,
    title: row.title || row.location.split("/").pop() || "Untitled",
    artist: row.artist || "Unknown artist",
    bpm: row.bpm,
    musicalKey: row.key ?? undefined,
    previewUrl,
    createdAt: row.created_at,
    readiness,
    studio,
  } as Track;
}

function readinessFromTrackOrEvidence(analysis: TrackAnalysis) {
  return (
    analysis.readiness ??
    readinessFromAnalysisEvidence({
      state: analysis.state,
      stages: analysis.stages,
      features: analysis.features,
      embeddings: analysis.embeddings,
    })
  );
}

function mapRun(row: LocalAnalysisRun): AnalysisRun {
  return {
    id: row.id,
    libraryId: row.library_id ?? "",
    status: row.status,
    mode: row.mode ?? "fast",
    manifestName: row.manifest_name ?? undefined,
    manifestVersion: row.manifest_version ?? undefined,
  };
}

function mapAnalysis(row: LocalTrackAnalysis): TrackAnalysis {
  const features = row.features ?? [];
  const embeddings = row.embeddings ?? [];
  const stages = row.stages ?? [];
  return {
    trackId: row.track_id,
    runId: row.run_id ?? undefined,
    readiness: readinessFromAnalysisEvidence({
      state: row.state,
      stages,
      features,
      embeddings,
    }),
    features: { items: features, state: row.state ?? undefined },
    embeddings,
    stages,
    state: row.state ?? undefined,
  };
}

function mapRunTrack(row: LocalRunTrack, runId: string): TrackAnalysis {
  const trackId =
    row.track_id ?? (typeof row.id === "string" && row.id ? row.id : "");
  return {
    trackId,
    runId,
    readiness: readinessFromAnalysisEvidence({
      state: row.status,
      stagesTotal: row.stages_total,
      stagesDone: row.stages_done,
      stagesRunning: row.stages_running,
      stagesFailed: row.stages_failed,
    }),
  };
}

export class LocalAdapter implements LocalRuntimeAdapter {
  readonly runtime = "local" as const;
  readonly baseUrl: string;
  private readonly requestFetch: typeof fetch;

  constructor(options: LocalAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    this.requestFetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const response = await this.requestFetch(`${this.baseUrl}${path}`, {
        cache: "no-store",
        ...init,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new AdapterError({
          code: `LOCAL_HTTP_${response.status}`,
          message: detail || `Local API request failed with status ${response.status}.`,
          retryable: response.status >= 500,
          remediation: "Verify that apps/local-api is running and its contract is current.",
        });
      }
      return (await response.json()) as T;
    } catch (error) {
      throw normalizeAdapterError(error, "LOCAL_API_UNAVAILABLE");
    }
  }

  private async analysisFor(trackId: string): Promise<TrackAnalysis | null> {
    try {
      return await this.getTrackAnalysis(trackId);
    } catch {
      return null;
    }
  }

  async health() {
    const body = await this.request<components["schemas"]["HealthResponse"]>("/health");
    return { ok: body.ok, runtime: "local" as const };
  }

  async listLibraries(): Promise<readonly Library[]> {
    const body = await this.request<components["schemas"]["LibrariesResponse"]>("/libraries");
    return body.libraries.map(mapLibrary);
  }

  async listTracks(options: ListTracksOptions = {}): Promise<readonly Track[]> {
    const path = options.libraryId ? `/libraries/${encodeURIComponent(options.libraryId)}/tracks` : "/tracks";
    const body = await this.request<components["schemas"]["TracksResponse"]>(path);
    const query = options.query?.trim().toLowerCase();
    const filtered = query
      ? body.tracks.filter((row) => `${row.title} ${row.artist}`.toLowerCase().includes(query))
      : body.tracks;
    const offset = options.offset ?? 0;
    const end = options.limit == null ? undefined : offset + options.limit;
    const rows = filtered.slice(offset, end);
    return Promise.all(
      rows.map(async (row) => mapTrack(row, this.baseUrl, await this.analysisFor(row.id))),
    );
  }

  async getTrack(trackId: string): Promise<Track> {
    const row = await this.request<LocalTrack>(`/tracks/${encodeURIComponent(trackId)}`);
    return mapTrack(row, this.baseUrl, await this.analysisFor(row.id));
  }

  async createAnalysisRun(input: CreateAnalysisRunInput): Promise<AnalysisRun> {
    const body = await this.request<LocalAnalysisRun>(
      `/libraries/${encodeURIComponent(input.libraryId)}/analysis-runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest_name: input.manifestName,
          manifest_version: input.manifestVersion,
          mode: input.mode,
          idempotency_key: input.idempotencyKey,
        }),
      },
    );
    return mapRun(body);
  }

  async getAnalysisRun(runId: string): Promise<AnalysisRun> {
    return mapRun(
      await this.request<LocalAnalysisRun>(`/analysis-runs/${encodeURIComponent(runId)}`),
    );
  }

  async listAnalysisRunTracks(runId: string): Promise<readonly TrackAnalysis[]> {
    const body = await this.request<components["schemas"]["AnalysisRunTracksResponse"]>(
      `/analysis-runs/${encodeURIComponent(runId)}/tracks`,
    );
    return body.tracks.map((row) => mapRunTrack(row, runId));
  }

  async cancelAnalysisRun(runId: string): Promise<AnalysisRun> {
    return mapRun(
      await this.request<LocalAnalysisRun>(
        `/analysis-runs/${encodeURIComponent(runId)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "cancelled_by_user" }),
        },
      ),
    );
  }

  async retryAnalysisStage(stageId: string, reason?: string): Promise<void> {
    await this.request(`/analysis-stages/${encodeURIComponent(stageId)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  }

  async getTrackAnalysis(trackId: string, runId?: string): Promise<TrackAnalysis> {
    const query = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
    return mapAnalysis(
      await this.request<LocalTrackAnalysis>(
        `/tracks/${encodeURIComponent(trackId)}/analysis${query}`,
      ),
    );
  }

  async getTrackNeighbors(
    trackId: string,
    options: NeighborOptions = {},
  ): Promise<readonly Neighbor[]> {
    const query = new URLSearchParams();
    if (options.runId) query.set("run_id", options.runId);
    query.set("channel", options.channel ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL);
    if (options.limit != null) query.set("limit", String(options.limit));
    const body = await this.request<components["schemas"]["TrackNeighborsResponse"]>(
      `/tracks/${encodeURIComponent(trackId)}/neighbors?${query}`,
    );
    return body.neighbors.flatMap((row) => {
      const id = row.track_id ?? row.target_track_id;
      if (!id) return [];
      return [
        {
          trackId: id,
          score: row.score,
          component: row.channel ?? body.channel ?? undefined,
          evidence: {
            rank: row.rank,
            distance: row.distance,
            components: row.components,
            reasonCodes: row.reason_codes,
            channel: row.channel ?? body.channel,
            runId: body.run_id,
          },
        },
      ];
    });
  }

  async getPlaybackUrl(trackId: string): Promise<PlaybackUrl> {
    return { url: `${this.baseUrl}/audio/${encodeURIComponent(trackId)}` };
  }

  async importFolder(input: ImportFolderInput): Promise<ImportResult> {
    const body = await this.request<components["schemas"]["FolderImportResponse"]>(
      "/imports/folder",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder_path: input.folderPath,
          library_name: input.libraryName ?? "Local Music",
        }),
      },
    );
    return {
      libraryId: body.library_id,
      outcomes: body.outcomes.map((outcome) => ({
        path: outcome.path,
        trackId: outcome.track_id ?? undefined,
        status: outcome.status,
        reason: outcome.reason ?? undefined,
        warnings: outcome.warnings,
      })),
    };
  }
}
