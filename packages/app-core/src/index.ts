import type { CrateDigAdapter, Health } from "@crate-dig/contracts";

export {
  analysisStatusFromReadiness,
  displaySimilarityReasons,
  neighborIsNonSonic,
  neighborReasonCopy,
  previewStateFromUrl,
  readinessFromAnalysisEvidence,
  readinessFromTrackAnalysis,
} from "./analysis";
export {
  BPM_BOUNDS,
  activeFilterCount,
  keysCompatible,
  mapTrackToStudio,
  matchesStudioFilters,
  orderTracksByNeighbors,
  prototypeDisplayCoordinates,
  prototypeMapDistanceNeighbors,
} from "./studio";
export type {
  AnalysisStatus,
  Energy,
  Mood,
  PreviewState,
  SimilarityReason,
  StudioFilters,
  StudioTrack,
  Texture,
} from "./studio";

export interface AppServices {
  adapter: CrateDigAdapter;
}

export async function checkRuntime(services: AppServices): Promise<Health> {
  return services.adapter.health();
}
