import "server-only";

import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL, type Neighbor } from "@crate-dig/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareLibrosaCorpus, rankCosineNeighbors } from "./rank";

type EmbeddingRow = {
  track_id: string;
  embedding_raw: number[] | null;
  created_at: string;
};

type Corpus = {
  fetchedAt: number;
  vectors: Map<string, number[]>;
};

const CORPUS_TTL_MS = 60_000;
const corpusCache = new Map<string, Corpus>();

async function demoTrackIds(supabase: SupabaseClient): Promise<string[]> {
  const { data: libraries, error: libraryError } = await supabase
    .from("libraries")
    .select("id")
    .eq("source", "demo");
  if (libraryError) throw libraryError;
  const libraryIds = (libraries ?? []).map((row) => row.id);
  if (!libraryIds.length) return [];
  const { data: tracks, error: trackError } = await supabase
    .from("tracks")
    .select("id, library_id")
    .in("library_id", libraryIds);
  if (trackError) throw trackError;
  return (tracks ?? []).map((row) => row.id);
}

async function libraryTrackIds(
  supabase: SupabaseClient,
  trackId: string,
): Promise<{ libraryId: string; trackIds: string[] }> {
  const { data: track, error } = await supabase.from("tracks").select("id, library_id").eq("id", trackId).maybeSingle();
  if (error) throw error;
  if (!track?.library_id) return { libraryId: "", trackIds: [] };
  const { data: tracks, error: listError } = await supabase
    .from("tracks")
    .select("id")
    .eq("library_id", track.library_id);
  if (listError) throw listError;
  return { libraryId: track.library_id, trackIds: (tracks ?? []).map((row) => row.id) };
}

function latestLibrosaVector(rows: EmbeddingRow[]): number[] | null {
  const usable = rows
    .filter((row) => Array.isArray(row.embedding_raw) && row.embedding_raw.length > 0)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const raw = usable[0]?.embedding_raw;
  if (!raw || raw.some((value) => !Number.isFinite(value))) return null;
  return raw;
}

export async function loadLibrosaCorpus(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, number[]>> {
  const raw = new Map<string, number[]>();
  const chunkSize = 80;
  for (let offset = 0; offset < trackIds.length; offset += chunkSize) {
    const chunk = trackIds.slice(offset, offset + chunkSize);
    const { data, error } = await supabase
      .from("track_embeddings")
      .select("track_id, embedding_raw, created_at")
      .eq("model_name", "librosa")
      .in("track_id", chunk);
    if (error) throw error;
    const grouped = new Map<string, EmbeddingRow[]>();
    for (const row of (data ?? []) as EmbeddingRow[]) {
      const list = grouped.get(row.track_id) ?? [];
      list.push(row);
      grouped.set(row.track_id, list);
    }
    for (const [id, rows] of grouped) {
      const vector = latestLibrosaVector(rows);
      if (vector) raw.set(id, vector);
    }
  }
  return prepareLibrosaCorpus(raw);
}

async function corpusFor(supabase: SupabaseClient, cacheKey: string, trackIds: string[]): Promise<Map<string, number[]>> {
  const cached = corpusCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CORPUS_TTL_MS) return cached.vectors;
  const vectors = await loadLibrosaCorpus(supabase, trackIds);
  corpusCache.set(cacheKey, { fetchedAt: Date.now(), vectors });
  return vectors;
}

export async function listSupabaseNeighbors(
  supabase: SupabaseClient,
  trackId: string,
  options: { limit?: number; channel?: string; demoOnly?: boolean } = {},
): Promise<Neighbor[]> {
  const channel = options.channel ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL;
  const limit = Math.min(Math.max(options.limit ?? 80, 1), 200);
  const scope = options.demoOnly
    ? { cacheKey: "demo", trackIds: await demoTrackIds(supabase) }
    : await libraryTrackIds(supabase, trackId).then((result) => ({
        cacheKey: `lib:${result.libraryId}`,
        trackIds: result.trackIds,
      }));
  if (!scope.trackIds.includes(trackId)) return [];
  const vectors = await corpusFor(supabase, scope.cacheKey, scope.trackIds);
  return rankCosineNeighbors(trackId, vectors, limit).map((item) => ({
    trackId: item.trackId,
    score: item.score,
    component: channel,
    evidence: {
      rank: item.rank,
      distance: item.distance,
      channel,
      source: "supabase",
    },
  }));
}
