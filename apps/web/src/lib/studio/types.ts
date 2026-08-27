export type {
  AnalysisStatus,
  Energy,
  Mood,
  PreviewState,
  SimilarityReason,
  StudioFilters,
  StudioTrack,
  Texture,
} from "@crate-dig/app-core";

export type ColorBy = "cluster" | "mood" | "energy" | "similarity";
export type PlayStatus = "idle" | "loading" | "playing" | "paused" | "buffering" | "failed";
export type RowDensity = "comfortable" | "compact";
export type MobileView = "map" | "list" | "crate";
export type LibraryView = "all" | "recent" | "unplayed";
export type LibrarySource = "mock" | "disk" | "cloud" | "preview";
export type Breakpoint = "mobile" | "small" | "tablet" | "laptop" | "desktop";

export type Crate = {
  id: string;
  name: string;
  trackIds: string[];
  intention: string;
  room: string;
  timeOfDay: string;
};

export type QCard = {
  trackId: string;
  title: string;
  artist: string;
  score: number;
  bpm: number | null;
  key: string | null;
  reason: string;
  blend?: "safer" | "pivot";
  nonSonic?: boolean;
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
