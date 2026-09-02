import {
  energyFromLevel,
  moodFromGenre,
  normalizeCamelotKey,
  studioFieldsFromCatalog,
  texturesFromGenre,
  type Energy,
  type Mood,
  type Texture,
} from "@crate-dig/app-core";

export { energyFromLevel, moodFromGenre, normalizeCamelotKey, texturesFromGenre };

export type PreviewTagRecord = {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  label?: string;
  key?: string;
  bpm?: number;
  year?: number;
  energyLevel?: number;
  rating?: number;
  durationSec?: number;
  dateAdded?: string;
  rekordboxTrackId?: string;
  objectKey?: string;
};

export type PreviewStudioFields = {
  key: string | null;
  genre: string;
  label: string;
  mood: Mood;
  energy: Energy;
  textures: Texture[];
  year: number;
  energyScore: number | null;
  tags: string[];
  analysisStatus: "ok" | "missing-metadata";
  suggestedMoment: string;
  clusterName: string;
};

export function studioFieldsFromPreviewTags(tags: PreviewTagRecord): PreviewStudioFields {
  const studio = studioFieldsFromCatalog({
    genre: tags.genre,
    label: tags.label,
    key: tags.key,
    bpm: tags.bpm,
    energyLevel: tags.energyLevel,
    year: tags.year,
    fallbackMoment: "R2 demo",
  });
  return {
    key: studio.key,
    genre: studio.genre,
    label: studio.label,
    mood: studio.mood,
    energy: studio.energy,
    textures: studio.textures,
    year: studio.year,
    energyScore: studio.energyScore,
    tags: studio.tags,
    analysisStatus: studio.analysisStatus === "ok" ? "ok" : "missing-metadata",
    suggestedMoment: "R2 demo",
    clusterName: studio.genre || "Demo library",
  };
}

export function previewCatalogTrackFromTags(
  entry: { id: string; title: string; artist: string },
  tags: PreviewTagRecord = {},
) {
  const studio = studioFieldsFromPreviewTags(tags);
  return {
    id: entry.id,
    title: (tags.title?.trim() || entry.title).trim() || entry.title,
    artist: (tags.artist?.trim() || entry.artist).trim() || entry.artist,
    bpm: tags.bpm ?? null,
    musicalKey: studio.key || undefined,
    studio: {
      ...studio,
      previewState: "ready" as const,
    },
  };
}
