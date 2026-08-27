export const PREVIEW_R2_PREFIXES = ["demo/", "libraries/demo/"] as const;
export const PREVIEW_R2_PREFIX = PREVIEW_R2_PREFIXES[0];

const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|aiff|aif)$/i;

export type PreviewCatalogEntry = {
  id: string;
  title: string;
  artist: string;
  objectKey: string;
};

function fnv1a(value: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function isAllowedPreviewObjectKey(objectKey: string): boolean {
  const trimmed = objectKey.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) return false;
  return PREVIEW_R2_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function previewTrackIdForKey(objectKey: string): string {
  const left = fnv1a(objectKey, 2166136261).toString(16).padStart(8, "0");
  const right = fnv1a(objectKey, 5381).toString(16).padStart(8, "0");
  return `r2-${left}${right}`;
}

export function parsePreviewTrack(objectKey: string): PreviewCatalogEntry | null {
  const trimmed = objectKey.trim();
  if (!isAllowedPreviewObjectKey(trimmed) || !AUDIO_EXT.test(trimmed)) return null;
  const parts = trimmed.split("/").filter(Boolean);
  const file = parts[parts.length - 1] ?? trimmed;
  const stem = file.replace(/\.[^.]+$/, "");
  const contentsIdx = parts.indexOf("Contents");
  let artist = "Unknown artist";
  if (contentsIdx >= 0) {
    const fromPath = parts[contentsIdx + 1]?.trim();
    if (fromPath && fromPath !== "UnknownAlbum") artist = fromPath;
  }
  let title = stem.replaceAll("_", " ").trim() || stem;
  const split = stem.split(" - ");
  if (split.length >= 2) {
    const filenameArtist = split[0]?.trim();
    const filenameTitle = split.slice(1).join(" - ").trim();
    if (filenameTitle) title = filenameTitle;
    if (artist === "Unknown artist" && filenameArtist) artist = filenameArtist;
  }
  return {
    id: previewTrackIdForKey(trimmed),
    title,
    artist,
    objectKey: trimmed,
  };
}
