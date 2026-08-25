export type Energy = "low" | "medium" | "peak" | "driving";
export type Texture = "raw" | "atmospheric" | "minimal" | "percussive" | "vocal";
export type Mood = "warm" | "euphoric" | "dark" | "dreamy" | "hypnotic";
export type ColorBy = "cluster" | "mood" | "energy" | "similarity";
export type AnalysisStatus = "ok" | "failed" | "missing-metadata" | "duplicate";
export type PreviewState = "ready" | "missing" | "failed" | "expired";
export type PlayStatus = "idle" | "loading" | "playing" | "paused" | "buffering" | "failed";
export type RowDensity = "comfortable" | "compact";
export type MobileView = "map" | "list" | "crate";
export type Breakpoint = "mobile" | "small" | "tablet" | "laptop" | "desktop";

export type StudioTrack = {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  key: string | null;
  genre: string;
  mood: Mood;
  energy: Energy;
  textures: Texture[];
  durationSec: number;
  year: number;
  label: string;
  cluster: number;
  clusterName: string;
  suggestedMoment: string;
  umap_x: number;
  umap_y: number;
  tags: string[];
  analysisStatus: AnalysisStatus;
  previewState: PreviewState;
  loudnessLufs: number | null;
  energyScore: number | null;
  hiddenFromRecs?: boolean;
  previewUrl?: string | null;
};

export type StudioFilters = {
  query: string;
  bpmMin: number;
  bpmMax: number;
  keys: string[];
  moods: Mood[];
  energies: Energy[];
  textures: Texture[];
  compatibleKeys: boolean;
  bpmNearSeed: boolean;
};

export type Crate = {
  id: string;
  name: string;
  trackIds: string[];
  intention: string;
  room: string;
  timeOfDay: string;
};

export type SimilarityReason = {
  label: string;
  kind: "shared" | "distance" | "compatible" | "warning";
};

export type QCard = {
  trackId: string;
  title: string;
  artist: string;
  score: number;
  bpm: number | null;
  key: string | null;
  reason: string;
  blend: "safer" | "pivot";
};

export type QStatus =
  | "collapsed"
  | "empty"
  | "track"
  | "multi"
  | "crate"
  | "loading"
  | "no-results"
  | "failure";

export type LiveMessage = { id: number; text: string };
