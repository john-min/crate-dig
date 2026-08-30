import {
  analysisStatusFromReadiness,
  previewStateFromUrl,
} from "@crate-dig/app-core";
import type {
  AnalysisRun,
  AuthSession,
  CloudRuntimeAdapter,
  CompletedCloudUpload,
  CompleteCloudUploadInput,
  CreateAnalysisRunInput,
  CreateSignedUploadInput,
  Library,
  ListTracksOptions,
  Neighbor,
  NeighborOptions,
  PlaybackUrl,
  SignedUploadSession,
  Track,
  TrackAnalysis,
} from "@crate-dig/contracts";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import { AdapterError, normalizeAdapterError, unavailable } from "./errors";

export const DEFAULT_CLOUD_API_PATH = "/api/cloud";

export interface CloudAdapterOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    remediation?: string;
  };
};

function mapTrack(row: Track): Track {
  const previewUrl = row.previewUrl || null;
  const readiness = row.readiness ?? "imported";
  const studio = (row as Track & { studio?: Record<string, unknown> }).studio;
  const previewState =
    typeof studio?.previewState === "string"
      ? studio.previewState
      : previewStateFromUrl(previewUrl);
  return {
    ...row,
    previewUrl,
    readiness,
    studio: {
      ...studio,
      analysisStatus:
        studio && "analysisStatus" in studio
          ? studio.analysisStatus
          : analysisStatusFromReadiness(readiness, !row.artist.trim()),
      previewState,
    },
  } as Track;
}

export class CloudAdapter implements CloudRuntimeAdapter {
  readonly runtime = "cloud" as const;
  readonly baseUrl: string;
  private readonly requestFetch: typeof fetch;
  private readonly getAccessToken?: () => Promise<string | null>;

  constructor(options: CloudAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl?.replace(/\/$/, "") || DEFAULT_CLOUD_API_PATH).replace(
      /\/$/,
      "",
    );
    this.requestFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.getAccessToken = options.getAccessToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    try {
      const response = await this.requestFetch(`${this.baseUrl}${path}`, {
        cache: "no-store",
        credentials: "include",
        ...init,
        headers,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorBody | null;
        throw new AdapterError({
          code: body?.error?.code ?? `CLOUD_HTTP_${response.status}`,
          message:
            body?.error?.message ||
            `Cloud API request failed with status ${response.status}.`,
          retryable: body?.error?.retryable ?? response.status >= 500,
          remediation: body?.error?.remediation,
        });
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      throw normalizeAdapterError(error, "CLOUD_API_UNAVAILABLE");
    }
  }

  async health() {
    const body = await this.request<{ ok: boolean; runtime?: string; version?: string }>(
      "/health",
    );
    return { ok: body.ok, runtime: "cloud" as const, version: body.version };
  }

  async listLibraries(): Promise<readonly Library[]> {
    const body = await this.request<{ libraries: Library[] }>("/libraries");
    return body.libraries;
  }

  async listTracks(options: ListTracksOptions = {}): Promise<readonly Track[]> {
    const query = new URLSearchParams();
    if (options.libraryId) query.set("libraryId", options.libraryId);
    if (options.query) query.set("query", options.query);
    if (options.limit != null) query.set("limit", String(options.limit));
    if (options.offset != null) query.set("offset", String(options.offset));
    const suffix = query.size ? `?${query}` : "";
    const body = await this.request<{ tracks: Track[] }>(`/tracks${suffix}`);
    return body.tracks.map(mapTrack);
  }

  async getTrack(trackId: string): Promise<Track> {
    const body = await this.request<{ track: Track }>(`/tracks/${encodeURIComponent(trackId)}`);
    return mapTrack(body.track);
  }

  async createAnalysisRun(_input: CreateAnalysisRunInput): Promise<AnalysisRun> {
    throw unavailable("Starting cloud analysis");
  }

  async getAnalysisRun(_runId: string): Promise<AnalysisRun> {
    throw unavailable("Loading cloud analysis");
  }

  async listAnalysisRunTracks(_runId: string): Promise<readonly TrackAnalysis[]> {
    throw unavailable("Listing cloud analysis tracks");
  }

  async cancelAnalysisRun(_runId: string): Promise<AnalysisRun> {
    throw unavailable("Cancelling cloud analysis");
  }

  async retryAnalysisStage(_stageId: string, _reason?: string): Promise<void> {
    throw unavailable("Retrying cloud analysis");
  }

  async getTrackAnalysis(_trackId: string, _runId?: string): Promise<TrackAnalysis> {
    throw unavailable("Loading cloud track analysis");
  }

  async getTrackNeighbors(
    trackId: string,
    options: NeighborOptions = {},
  ): Promise<readonly Neighbor[]> {
    const query = new URLSearchParams();
    if (options.runId) query.set("runId", options.runId);
    query.set("channel", options.channel ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL);
    if (options.limit != null) query.set("limit", String(options.limit));
    const body = await this.request<{
      neighbors?: Neighbor[];
      error?: { message?: string };
    }>(`/tracks/${encodeURIComponent(trackId)}/neighbors?${query}`);
    return body.neighbors ?? [];
  }

  async getPlaybackUrl(trackId: string): Promise<PlaybackUrl> {
    return this.request<PlaybackUrl>(`/tracks/${encodeURIComponent(trackId)}/playback`);
  }

  async createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadSession> {
    return this.request<SignedUploadSession>("/uploads", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async completeCloudUpload(input: CompleteCloudUploadInput): Promise<CompletedCloudUpload> {
    return this.request<CompletedCloudUpload>("/uploads/complete", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getAuthSession(): Promise<AuthSession | null> {
    try {
      return await this.request<AuthSession>("/session");
    } catch (error) {
      if (error instanceof AdapterError && error.code === "CLOUD_UNAUTHORIZED") {
        return null;
      }
      throw error;
    }
  }
}
