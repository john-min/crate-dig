import "server-only";

import type { Track } from "@crate-dig/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { layoutGenreIslands, type LaidOutTrack } from "./genre-layout";
import { projectPca2d } from "./pca";
import { loadLibrosaCorpus } from "./supabase-store";

type StudioLike = {
  genre?: string;
  cluster?: number;
  clusterName?: string;
  umap_x?: number;
  umap_y?: number;
};

type ClusterMemberRow = {
  track_id: string;
  umap_x: number | null;
  umap_y: number | null;
  analysis_run_id: string | null;
};

const CHUNK = 80;
const UMAP_COVERAGE = 0.7;

function hashLocal(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  const unsigned = hash >>> 0;
  const angle = ((unsigned % 360) * Math.PI) / 180;
  const radius = 0.15 + (unsigned % 40) / 220;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

async function loadUmapLocals(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, { x: number; y: number }>> {
  const rows: ClusterMemberRow[] = [];
  for (let offset = 0; offset < trackIds.length; offset += CHUNK) {
    const chunk = trackIds.slice(offset, offset + CHUNK);
    const { data, error } = await supabase
      .from("cluster_members")
      .select("track_id, umap_x, umap_y, analysis_run_id")
      .in("track_id", chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as ClusterMemberRow[]));
  }

  const byRun = new Map<string, ClusterMemberRow[]>();
  for (const row of rows) {
    if (
      row.umap_x == null ||
      row.umap_y == null ||
      !Number.isFinite(row.umap_x) ||
      !Number.isFinite(row.umap_y)
    ) {
      continue;
    }
    const runId = row.analysis_run_id ?? "unknown";
    const list = byRun.get(runId) ?? [];
    list.push(row);
    byRun.set(runId, list);
  }

  let best: ClusterMemberRow[] = [];
  for (const list of byRun.values()) {
    if (list.length > best.length) best = list;
  }
  if (best.length < trackIds.length * UMAP_COVERAGE) return new Map();

  const locals = new Map<string, { x: number; y: number }>();
  for (const row of best) {
    if (!locals.has(row.track_id)) {
      locals.set(row.track_id, { x: row.umap_x!, y: row.umap_y! });
    }
  }
  return locals;
}

async function loadEmbeddingLocals(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, { x: number; y: number }>> {
  const vectors = await loadLibrosaCorpus(supabase, trackIds);
  return projectPca2d(vectors);
}

function localsForTracks(
  trackIds: string[],
  preferred: Map<string, { x: number; y: number }>,
  fallback: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const locals = new Map<string, { x: number; y: number }>();
  for (const id of trackIds) {
    locals.set(id, preferred.get(id) ?? fallback.get(id) ?? hashLocal(id));
  }
  return locals;
}

export async function applyGenreIslandProjection(
  supabase: SupabaseClient,
  tracks: Track[],
): Promise<Track[]> {
  if (tracks.length === 0) return tracks;
  const trackIds = tracks.map((track) => track.id);
  let umap = new Map<string, { x: number; y: number }>();
  let embeddings = new Map<string, { x: number; y: number }>();
  try {
    umap = await loadUmapLocals(supabase, trackIds);
  } catch {
    umap = new Map();
  }
  if (umap.size < trackIds.length) {
    try {
      embeddings = await loadEmbeddingLocals(supabase, trackIds);
    } catch {
      embeddings = new Map();
    }
  }

  const locals = localsForTracks(trackIds, umap, embeddings);
  const laid = layoutGenreIslands(
    tracks.map((track) => {
      const studio = (track as Track & { studio?: StudioLike }).studio;
      const local = locals.get(track.id) ?? hashLocal(track.id);
      return {
        id: track.id,
        genre: studio?.genre ?? studio?.clusterName ?? "",
        x: local.x,
        y: local.y,
      };
    }),
  );

  return tracks.map((track) => {
    const layout = laid.get(track.id);
    if (!layout) return track;
    return stampLayout(track, layout);
  });
}

function stampLayout(track: Track, layout: LaidOutTrack): Track {
  const studio = (track as Track & { studio?: StudioLike }).studio ?? {};
  return {
    ...track,
    studio: {
      ...studio,
      umap_x: layout.x,
      umap_y: layout.y,
      cluster: layout.cluster,
      clusterName: layout.clusterName,
    },
  } as Track;
}
