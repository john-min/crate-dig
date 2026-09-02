import {
  analysisStatusFromReadiness,
  previewStateFromUrl,
  readinessFromAnalysisEvidence,
} from "./analysis";
import type { AnalysisStatus, Energy, Mood, Texture } from "./studio";
import type { Readiness, Track, TrackAnalysis } from "@crate-dig/contracts";

const VALID_MOODS = new Set<Mood>(["warm", "euphoric", "dark", "dreamy", "hypnotic"]);
const VALID_ENERGIES = new Set<Energy>(["low", "medium", "peak", "driving"]);
const VALID_TEXTURES = new Set<Texture>([
  "raw",
  "atmospheric",
  "minimal",
  "percussive",
  "vocal",
]);

export function normalizeCamelotKey(value: string): string {
  const match = value.trim().toUpperCase().match(/^0?(\d{1,2})([AB])$/);
  if (!match) return value.trim();
  return `${Number(match[1])}${match[2]}`;
}

export function moodFromGenre(genre: string): Mood {
  const value = genre.toLowerCase();
  if (/techno|industrial|hypnotic|acid/.test(value)) return "dark";
  if (/progressive|trance|peak/.test(value)) return "euphoric";
  if (/ambient|downtempo|organic|melodic|dream/.test(value)) return "dreamy";
  if (/deep|disco|soulful|afro/.test(value)) return "warm";
  if (/g-house|tech house|garage/.test(value)) return "hypnotic";
  if (/house/.test(value)) return "warm";
  return "warm";
}

export function energyFromLevel(level: number | undefined | null): Energy {
  if (level == null) return "medium";
  if (level <= 2) return "low";
  if (level <= 4) return "medium";
  if (level <= 6) return "driving";
  return "peak";
}

export function texturesFromGenre(genre: string): Texture[] {
  const value = genre.toLowerCase();
  const textures: Texture[] = [];
  if (/vocal|singer/.test(value)) textures.push("vocal");
  if (/ambient|melodic|organic|atmospheric/.test(value)) textures.push("atmospheric");
  if (/minimal/.test(value)) textures.push("minimal");
  if (/techno|tech|percuss|drum/.test(value)) textures.push("percussive");
  if (/raw|acid|industrial/.test(value)) textures.push("raw");
  if (textures.length === 0) textures.push("minimal");
  return textures;
}

export type CatalogStudioInput = {
  genre?: string | null;
  label?: string | null;
  key?: string | null;
  bpm?: number | null;
  energyLevel?: number | null;
  year?: number | null;
  durationSec?: number | null;
  cluster?: number | null;
  clusterName?: string | null;
  suggestedMoment?: string | null;
  umapX?: number | null;
  umapY?: number | null;
  tags?: string[];
  fallbackMoment?: string;
};

export type CatalogStudioFields = {
  key: string | null;
  genre: string;
  label: string;
  mood: Mood;
  energy: Energy;
  textures: Texture[];
  year: number;
  durationSec: number;
  energyScore: number | null;
  tags: string[];
  cluster: number;
  clusterName: string;
  suggestedMoment: string;
  umap_x?: number;
  umap_y?: number;
  analysisStatus: AnalysisStatus;
};

export function studioFieldsFromCatalog(input: CatalogStudioInput): CatalogStudioFields {
  const genre = input.genre?.trim() ?? "";
  const key = input.key ? normalizeCamelotKey(input.key) : null;
  const energy = energyFromLevel(input.energyLevel);
  const mood = moodFromGenre(genre);
  const textures = genre ? texturesFromGenre(genre) : (["minimal"] as Texture[]);
  const vibe = genre || mood;
  const hasMeta = Boolean(key || genre || input.bpm || input.energyLevel != null);
  const clusterName = input.clusterName?.trim() || "";
  const fields: CatalogStudioFields = {
    key,
    genre,
    label: input.label?.trim() ?? "",
    mood: VALID_MOODS.has(mood) ? mood : "warm",
    energy: VALID_ENERGIES.has(energy) ? energy : "medium",
    textures: textures.filter((item) => VALID_TEXTURES.has(item)),
    year: input.year ?? 0,
    durationSec: input.durationSec ?? 0,
    energyScore: input.energyLevel ?? null,
    tags: input.tags ?? [vibe, energy, ...textures].slice(0, 4),
    cluster: input.cluster ?? 0,
    clusterName:
      clusterName ||
      (input.cluster != null ? `Cluster ${input.cluster}` : hasMeta ? genre || "Unanalyzed" : "Unanalyzed"),
    suggestedMoment: input.suggestedMoment?.trim() || input.fallbackMoment || "Local file",
    analysisStatus: hasMeta ? "ok" : "missing-metadata",
  };
  if (input.umapX != null && Number.isFinite(input.umapX)) fields.umap_x = input.umapX;
  if (input.umapY != null && Number.isFinite(input.umapY)) fields.umap_y = input.umapY;
  return fields;
}

export type LocalCatalogTrackRow = {
  id: string;
  library_id: string;
  title: string;
  artist: string;
  genre?: string | null;
  label?: string | null;
  bpm?: number | null;
  key?: string | null;
  duration_sec?: number | null;
  location?: string | null;
  created_at?: string | null;
  preview_url?: string | null;
  energy_rating?: number | null;
  umap_x?: number | null;
  umap_y?: number | null;
  cluster_index?: number | null;
  cluster_name?: string | null;
  suggested_moment?: string | null;
  analysis_state?: string | null;
};

function readinessFromLocalRow(
  row: LocalCatalogTrackRow,
  analysis?: TrackAnalysis | null,
): Readiness {
  if (analysis?.readiness) return analysis.readiness;
  if (analysis) {
    return readinessFromAnalysisEvidence({
      state: analysis.state,
      stages: analysis.stages,
      features: analysis.features,
      embeddings: analysis.embeddings,
    });
  }
  const state = row.analysis_state?.trim();
  if (state) {
    return readinessFromAnalysisEvidence({ state });
  }
  if (row.umap_x != null && row.umap_y != null) return "ready_fast";
  return "imported";
}

export function mapLocalCatalogTrack(
  row: LocalCatalogTrackRow,
  options: { previewUrl: string | null; analysis?: TrackAnalysis | null },
): Track {
  const readiness = readinessFromLocalRow(row, options.analysis);
  const studio = studioFieldsFromCatalog({
    genre: row.genre,
    label: row.label,
    key: row.key,
    bpm: row.bpm,
    energyLevel: row.energy_rating,
    durationSec: row.duration_sec,
    cluster: row.cluster_index,
    clusterName: row.cluster_name,
    suggestedMoment: row.suggested_moment,
    umapX: row.umap_x,
    umapY: row.umap_y,
    fallbackMoment: "Local file",
  });
  if (options.analysis) {
    studio.analysisStatus = analysisStatusFromReadiness(readiness, !row.artist.trim());
  } else if (row.analysis_state === "failed") {
    studio.analysisStatus = "failed";
  } else if (row.analysis_state === "completed" || row.umap_x != null) {
    studio.analysisStatus = "ok";
  }
  return {
    id: row.id,
    libraryId: row.library_id,
    title: row.title || row.location?.split("/").pop() || "Untitled",
    artist: row.artist || "Unknown artist",
    bpm: row.bpm,
    musicalKey: studio.key || undefined,
    previewUrl: options.previewUrl,
    createdAt: row.created_at ?? undefined,
    readiness,
    studio: {
      ...studio,
      previewState: previewStateFromUrl(options.previewUrl),
      loudnessLufs: null,
    },
  } as Track;
}
