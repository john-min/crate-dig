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
  energyFromLevel,
  mapLocalCatalogTrack,
  moodFromGenre,
  normalizeCamelotKey,
  studioFieldsFromCatalog,
  texturesFromGenre,
} from "./catalog";
export type { CatalogStudioFields, CatalogStudioInput, LocalCatalogTrackRow } from "./catalog";
export {
  BPM_BOUNDS,
  bpmBoundsFromTracks,
  activeFilterCount,
  isBpmFilterActive,
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
  BpmBounds,
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
