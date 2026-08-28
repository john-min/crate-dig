import "server-only";

import type { Library, Track } from "@crate-dig/contracts";
import { demoPlaybackObjectKey, listDemoLibraries, listDemoLibraryTracks } from "@/lib/cloud/records";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

const CACHE_MS = 30_000;
let cache: { at: number; libraries: Library[]; tracks: Track[] } | null = null;

export function previewCatalogConfigured(): boolean {
  return Boolean(tryCreateAdminClient());
}

export async function loadDemoPreviewCatalog(force = false): Promise<{
  libraries: Library[];
  tracks: Track[];
}> {
  const supabase = tryCreateAdminClient();
  if (!supabase) return { libraries: [], tracks: [] };
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  const libraries = await listDemoLibraries(supabase);
  const tracks = await listDemoLibraryTracks(supabase);
  cache = { at: Date.now(), libraries, tracks };
  return cache;
}

export async function previewObjectKeyForTrackId(trackId: string): Promise<string | null> {
  const supabase = tryCreateAdminClient();
  if (!supabase) return null;
  return demoPlaybackObjectKey(supabase, trackId);
}
