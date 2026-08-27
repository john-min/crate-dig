import "server-only";

import { getR2Config } from "@/lib/r2/env";
import { listR2ObjectKeys } from "@/lib/r2/client";
import {
  isAllowedPreviewObjectKey,
  parsePreviewTrack,
  type PreviewCatalogEntry,
} from "./r2-catalog";

const CACHE_MS = 30_000;
let cache: { at: number; entries: PreviewCatalogEntry[] } | null = null;

export async function loadPreviewCatalog(force = false): Promise<PreviewCatalogEntry[]> {
  if (!getR2Config()) return [];
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  const keys = [
    ...(await listR2ObjectKeys("demo/")),
    ...(await listR2ObjectKeys("libraries/demo/")),
  ];
  const seen = new Set<string>();
  const entries: PreviewCatalogEntry[] = [];
  for (const key of keys) {
    if (seen.has(key) || !isAllowedPreviewObjectKey(key)) continue;
    seen.add(key);
    const parsed = parsePreviewTrack(key);
    if (parsed) entries.push(parsed);
  }
  entries.sort(
    (left, right) =>
      left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title),
  );
  cache = { at: Date.now(), entries };
  return entries;
}

export async function previewObjectKeyForTrackId(trackId: string): Promise<string | null> {
  const id = trackId.trim();
  if (!id) return null;
  const entries = await loadPreviewCatalog();
  return entries.find((entry) => entry.id === id)?.objectKey ?? null;
}
