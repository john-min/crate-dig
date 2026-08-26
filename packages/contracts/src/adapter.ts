import type {
  AnalysisRun,
  AppMode,
  AuthSession,
  Crate,
  Health,
  ImportOutcome,
  Library,
  Neighbor,
  PlaybackUrl,
  ProjectionMapFeed,
  Track,
  TrackAnalysis,
} from "./domain";

export interface ListTracksOptions {
  libraryId?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ImportFolderInput {
  folderPath: string;
  libraryName?: string;
}

export interface ImportResult {
  libraryId: string;
  outcomes: readonly ImportOutcome[];
}

export interface CreateAnalysisRunInput {
  libraryId: string;
  manifestName: string;
  manifestVersion: string;
  mode: "fast" | "deep";
  idempotencyKey: string;
}

/**
 * Versioned neighbor channel implemented by the local analysis API.
 * Clients must request this identity explicitly; omitting it can return mixed
 * or raw `global` neighbors instead of the z-scored librosa ranking.
 */
export const LOCAL_ANALYSIS_NEIGHBOR_CHANNEL = "librosa-zscore-v1";

export interface NeighborOptions {
  runId?: string;
  /**
   * Versioned embedding/channel identity. Local analysis implements
   * {@link LOCAL_ANALYSIS_NEIGHBOR_CHANNEL}; do not omit it to accept an
   * unspecified server default.
   */
  channel?: string;
  limit?: number;
}

export interface CreateSignedUploadInput {
  libraryId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
}

export interface SignedUploadSession {
  uploadId: string;
  objectKey: string;
  url: string;
  method: "PUT";
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface CompleteCloudUploadInput {
  uploadId: string;
  objectKey: string;
  etag?: string;
}

export interface CompletedCloudUpload {
  trackId: string;
  libraryId: string;
  objectKey: string;
}

export interface LocalImportCapability {
  importFolder(input: ImportFolderInput): Promise<ImportResult>;
}

export interface CloudUploadCapability {
  createSignedUpload(input: CreateSignedUploadInput): Promise<SignedUploadSession>;
  completeCloudUpload(
    input: CompleteCloudUploadInput,
  ): Promise<CompletedCloudUpload>;
}

export interface AuthCapability {
  getAuthSession(): Promise<AuthSession | null>;
}

/**
 * Planned crate ownership contract. A runtime advertises it only when implemented;
 * this does not imply that the current local API exposes crate endpoints.
 */
export interface CrateCapability {
  listCrates(libraryId?: string): Promise<readonly Crate[]>;
  getCrate(crateId: string): Promise<Crate>;
  saveCrate(crate: Crate): Promise<Crate>;
  deleteCrate(crateId: string): Promise<void>;
}

/**
 * Planned projection/map feed contract. It intentionally remains separate from
 * track-neighbor retrieval and does not claim a current local HTTP route.
 */
export interface ProjectionCapability {
  getProjectionMapFeed(projectionVersion?: string): Promise<ProjectionMapFeed>;
}

/**
 * Platform-neutral application boundary.
 *
 * Implementations may use fixture data, loopback HTTP, or authenticated cloud HTTP.
 * Native path selection and process lifecycle intentionally live outside this interface.
 */
export interface CrateDigAdapter {
  readonly runtime: AppMode;
  health(): Promise<Health>;
  listLibraries(): Promise<readonly Library[]>;
  listTracks(options?: ListTracksOptions): Promise<readonly Track[]>;
  getTrack(trackId: string): Promise<Track>;
  createAnalysisRun(input: CreateAnalysisRunInput): Promise<AnalysisRun>;
  getAnalysisRun(runId: string): Promise<AnalysisRun>;
  listAnalysisRunTracks(runId: string): Promise<readonly TrackAnalysis[]>;
  cancelAnalysisRun(runId: string): Promise<AnalysisRun>;
  retryAnalysisStage(stageId: string, reason?: string): Promise<void>;
  getTrackAnalysis(trackId: string, runId?: string): Promise<TrackAnalysis>;
  getTrackNeighbors(
    trackId: string,
    options?: NeighborOptions,
  ): Promise<readonly Neighbor[]>;
  getPlaybackUrl(trackId: string): Promise<PlaybackUrl>;
}

export type MockRuntimeAdapter = CrateDigAdapter &
  LocalImportCapability & {
    readonly runtime: "mock";
  };

export type LocalRuntimeAdapter = CrateDigAdapter &
  LocalImportCapability & {
    readonly runtime: "local";
  };

export type CloudRuntimeAdapter = CrateDigAdapter &
  CloudUploadCapability &
  AuthCapability & {
    readonly runtime: "cloud";
  };

export type DesktopRuntimeAdapter = CrateDigAdapter &
  LocalImportCapability &
  Partial<AuthCapability> & {
    readonly runtime: "desktop";
  };

export type RuntimeAdapter =
  | MockRuntimeAdapter
  | LocalRuntimeAdapter
  | CloudRuntimeAdapter
  | DesktopRuntimeAdapter;

export interface RuntimeComposition<TAdapter extends RuntimeAdapter> {
  adapter: TAdapter;
  crates?: CrateCapability;
  projection?: ProjectionCapability;
}

export type MockRuntimeComposition = RuntimeComposition<MockRuntimeAdapter>;
export type LocalRuntimeComposition = RuntimeComposition<LocalRuntimeAdapter>;
export type CloudRuntimeComposition = RuntimeComposition<CloudRuntimeAdapter>;
export type DesktopRuntimeComposition = RuntimeComposition<DesktopRuntimeAdapter>;

export function hasLocalImport(
  adapter: CrateDigAdapter,
): adapter is CrateDigAdapter & LocalImportCapability {
  return "importFolder" in adapter;
}

export function hasCloudUpload(
  adapter: CrateDigAdapter,
): adapter is CrateDigAdapter & CloudUploadCapability {
  return "createSignedUpload" in adapter && "completeCloudUpload" in adapter;
}
