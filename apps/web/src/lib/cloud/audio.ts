export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/aac",
  "audio/ogg",
  "audio/aiff",
  "audio/x-aiff",
]);

export function isAllowedAudioType(contentType: string): boolean {
  const normalized = contentType.trim().toLowerCase();
  return AUDIO_TYPES.has(normalized) || normalized.startsWith("audio/");
}

export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || "audio";
  const safe = base.replace(/[^\w.\-()+ ]+/g, "_").replace(/\s+/g, " ").slice(0, 180);
  return safe || "audio";
}
