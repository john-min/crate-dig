import type { Energy, Mood, Texture } from "@crate-dig/app-core";

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

export function energyFromLevel(level: number | undefined): Energy {
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
  const genre = tags.genre?.trim() ?? "";
  const key = tags.key ? normalizeCamelotKey(tags.key) : null;
  const energy = energyFromLevel(tags.energyLevel);
  const mood = genre ? moodFromGenre(genre) : "warm";
  const textures = genre ? texturesFromGenre(genre) : (["minimal"] as Texture[]);
  const vibe = genre || mood;
  const hasMeta = Boolean(key || genre || tags.bpm || tags.energyLevel != null);
  return {
    key,
    genre,
    label: tags.label?.trim() ?? "",
    mood,
    energy,
    textures,
    year: tags.year ?? 0,
    energyScore: tags.energyLevel ?? null,
    tags: [vibe, energy, ...textures].slice(0, 4),
    analysisStatus: hasMeta ? "ok" : "missing-metadata",
    suggestedMoment: "R2 demo",
    clusterName: genre || "Demo library",
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
