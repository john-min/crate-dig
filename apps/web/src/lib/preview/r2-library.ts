import "server-only";

import type { Library, Track } from "@crate-dig/contracts";
import { demoPlaybackObjectKey, listDemoLibraries, listDemoLibraryTracks } from "@/lib/cloud/records";
import {
  catalogSqliteAvailable,
  readCatalogSqlite,
  writeCatalogSqlite,
} from "@/lib/preview/catalog-sqlite";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

const CACHE_MS = 30_000;
export const LAYOUT_VERSION = "genre-pack-v2";
let cache: {
  at: number;
  version: string;
  libraries: Library[];
  tracks: Track[];
  objectKeys: Map<string, string>;
} | null = null;

export function previewCatalogConfigured(): boolean {
  return Boolean(tryCreateAdminClient()) || catalogSqliteAvailable();
}

export async function loadDemoPreviewCatalog(force = false): Promise<{
  libraries: Library[];
  tracks: Track[];
}> {
  if (!force && cache && cache.version === LAYOUT_VERSION && Date.now() - cache.at < CACHE_MS) {
    return cache;
  }

  if (!force) {
    const snapshot = readCatalogSqlite(LAYOUT_VERSION);
    if (snapshot) {
      cache = { at: Date.now(), version: LAYOUT_VERSION, ...snapshot };
      return cache;
    }
  }

  const supabase = tryCreateAdminClient();
  if (!supabase) return { libraries: [], tracks: [] };

  const libraries = await withRetry(() => listDemoLibraries(supabase));
  const { tracks, objectKeys } = await withRetry(() => listDemoLibraryTracks(supabase));
  cache = { at: Date.now(), version: LAYOUT_VERSION, libraries, tracks, objectKeys };
  try {
    writeCatalogSqlite(LAYOUT_VERSION, { libraries, tracks, objectKeys });
  } catch (error) {
    console.warn("[preview/catalog] could not write local sqlite snapshot", error);
  }
  return cache;
}

export async function previewObjectKeyForTrackId(trackId: string): Promise<string | null> {
  const id = trackId.trim();
  if (!id) return null;
  if (!cache || cache.version !== LAYOUT_VERSION) {
    const snapshot = readCatalogSqlite(LAYOUT_VERSION);
    if (snapshot) cache = { at: Date.now(), version: LAYOUT_VERSION, ...snapshot };
  }
  const cached = cache?.objectKeys.get(id);
  if (cached) return cached;
  const supabase = tryCreateAdminClient();
  if (!supabase) return null;
  return demoPlaybackObjectKey(supabase, id);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw last;
}
