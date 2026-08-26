export type AppMode = "mock" | "local" | "cloud" | "desktop";

export type Readiness =
  | "imported"
  | "queued"
  | "processing_fast"
  | "ready_fast"
  | "processing_deep"
  | "ready_deep"
  | "degraded"
  | "failed";

export interface CrateDigError {
  code: string;
  message: string;
  retryable: boolean;
  remediation?: string;
}

export interface Health {
  ok: boolean;
  runtime: "fixture" | "local" | "cloud";
  version?: string;
}

export interface Library {
  id: string;
  name: string;
  source: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Track {
  id: string;
  libraryId: string;
  title: string;
  artist: string;
  readiness?: Readiness;
  previewUrl?: string | null;
  bpm?: number | null;
  musicalKey?: string;
  createdAt?: string;
}

export type ImportOutcomeStatus =
  | "imported"
  | "duplicate"
  | "unsupported"
  | "corrupt"
  | "failed";

export interface ImportOutcome {
  path?: string;
  trackId?: string;
  status: ImportOutcomeStatus;
  reason?: string;
  warnings?: string[];
  error?: CrateDigError;
}

export interface AnalysisRun {
  id: string;
  libraryId: string;
  status: string;
  mode: "fast" | "deep";
  manifestName?: string;
  manifestVersion?: string;
}

export interface TrackAnalysis {
  trackId: string;
  runId?: string;
  readiness?: Readiness;
  features?: Readonly<Record<string, unknown>>;
  embeddings?: readonly Readonly<Record<string, unknown>>[];
  stages?: readonly Readonly<Record<string, unknown>>[];
  state?: string;
}

export interface Neighbor {
  trackId: string;
  score: number;
  component?: string;
  evidence?: Readonly<Record<string, unknown>>;
}

export interface AuthSession {
  userId: string;
  email?: string;
  expiresAt?: string;
}

export interface PlaybackUrl {
  url: string;
  expiresAt?: string;
}

export interface CrateTrack {
  trackId: string;
  position: number;
  section?: string;
  anchor?: boolean;
  bailout?: boolean;
  notes?: string;
}

export interface Crate {
  id: string;
  name: string;
  libraryId?: string;
  notes?: string;
  setIntention?: string;
  tracks: readonly CrateTrack[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectionPoint {
  trackId: string;
  x: number;
  y: number;
  clusterId?: string;
  readiness: Readiness;
}

export interface ProjectionMapFeed {
  projectionVersion: string;
  modelSetVersion: string;
  points: readonly ProjectionPoint[];
}
