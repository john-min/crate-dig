import "server-only";

import {
  analysisStatusFromReadiness,
  previewStateFromUrl,
  readinessFromAnalysisEvidence,
} from "@crate-dig/app-core";
import type { Library, Track } from "@crate-dig/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPlayableAudioObject, pickPlaybackObjectKey } from "@/lib/cloud/playback-object";
import { restrictDemoAudioObjects } from "@/lib/preview/r2-catalog";
import { studioFieldsFromPreviewTags } from "@/lib/preview/studio-from-tags";
import { applyGenreIslandProjection } from "@/lib/similarity/genre-projection";

type TrackRow = {
  id: string;
  library_id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  label: string | null;
  bpm: number | null;
  key: string | null;
  rating: number | null;
  energy_rating: number | null;
  duration_sec: number | null;
  created_at: string;
  audio_objects?: { id: string; kind: string; object_key: string }[] | null;
  track_features?: { status: string; features: unknown; created_at: string }[] | null;
  track_embeddings?: { id: string }[] | null;
};

export async function listOwnedLibraries(supabase: SupabaseClient): Promise<Library[]> {
  const { data, error } = await supabase
    .from("libraries")
    .select("id, name, source, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .sort((left, right) => {
      if (left.source === "demo" && right.source !== "demo") return -1;
      if (right.source === "demo" && left.source !== "demo") return 1;
      return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
    });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function ensureOwnedLibrary(
  supabase: SupabaseClient,
  userId: string,
  libraryId?: string,
): Promise<Library> {
  const libraries = await listOwnedLibraries(supabase);
  if (libraryId && libraries.some((library) => library.id === libraryId)) {
    return libraries.find((library) => library.id === libraryId)!;
  }
  if (libraryId && UUID_RE.test(libraryId)) {
    throw Object.assign(new Error("That library was not found."), { code: "CLOUD_NOT_FOUND" });
  }
  if (libraries[0]) return libraries[0];

  const { data, error } = await supabase
    .from("libraries")
    .insert({ user_id: userId, name: "Library", source: "upload" })
    .select("id, name, source, created_at, updated_at")
    .single();
  if (error || !data) throw error ?? new Error("Could not create a library.");
  return {
    id: data.id,
    name: data.name,
    source: data.source,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapTrackRow(row: TrackRow): Track {
  const latestFeature = [...(row.track_features ?? [])].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  )[0];
  const embeddings = row.track_embeddings ?? [];
  const analysisReadiness = readinessFromAnalysisEvidence({
    state:
      latestFeature?.status === "ok"
        ? "completed"
        : latestFeature?.status === "failed"
          ? "failed"
          : latestFeature?.status,
    features: latestFeature?.features,
    embeddings,
  });
  const audioObjects = row.audio_objects ?? [];
  const hasAudio = hasPlayableAudioObject(audioObjects);
  const studio = studioFieldsFromPreviewTags({
    genre: row.genre ?? "",
    label: row.label ?? "",
    key: row.key || undefined,
    bpm: row.bpm ?? undefined,
    energyLevel: row.energy_rating ?? undefined,
  });
  const readiness =
    analysisReadiness === "failed"
      ? analysisReadiness
      : hasAudio || studio.analysisStatus === "ok"
        ? "ready_fast"
        : analysisReadiness;
  // Signed URLs expire; the client fetches a fresh GET via /playback on play.
  const previewUrl = null;
  return {
    id: row.id,
    libraryId: row.library_id,
    title: row.title || "Untitled",
    artist: row.artist || "Unknown artist",
    bpm: row.bpm,
    musicalKey: studio.key || row.key || undefined,
    previewUrl,
    createdAt: row.created_at,
    readiness,
    studio: {
      ...studio,
      suggestedMoment: studio.genre ? studio.suggestedMoment : "Cloud upload",
      clusterName: studio.genre || (hasAudio ? "Uploaded" : "Unanalyzed"),
      durationSec: row.duration_sec ?? 0,
      cluster: 0,
      analysisStatus:
        studio.analysisStatus === "ok"
          ? "ok"
          : analysisStatusFromReadiness(readiness, !row.artist.trim()),
      previewState: hasAudio ? "ready" : previewStateFromUrl(previewUrl),
      loudnessLufs: null,
    },
  } as Track;
}

const TRACK_SELECT = `
  id, library_id, title, artist, album, genre, label, bpm, key, rating, energy_rating, duration_sec, created_at,
  audio_objects ( id, kind, object_key ),
  track_features ( status, features, created_at ),
  track_embeddings ( id )
`;

export async function listOwnedTracks(
  supabase: SupabaseClient,
  options: { libraryId?: string; query?: string; limit?: number; offset?: number } = {},
): Promise<Track[]> {
  let request = supabase.from("tracks").select(TRACK_SELECT).order("created_at", { ascending: false });
  if (options.libraryId) request = request.eq("library_id", options.libraryId);
  const { data, error } = await request;
  if (error) throw error;
  const query = options.query?.trim().toLowerCase();
  const rows = ((data ?? []) as TrackRow[]).filter((row) => {
    if (!query) return true;
    return `${row.title} ${row.artist}`.toLowerCase().includes(query);
  });
  const offset = options.offset ?? 0;
  const end = options.limit == null ? undefined : offset + options.limit;
  return rows.slice(offset, end).map(mapTrackRow);
}

export async function getOwnedTrack(supabase: SupabaseClient, trackId: string): Promise<Track | null> {
  const { data, error } = await supabase.from("tracks").select(TRACK_SELECT).eq("id", trackId).maybeSingle();
  if (error) throw error;
  return data ? mapTrackRow(data as TrackRow) : null;
}

export async function originalObjectKey(
  supabase: SupabaseClient,
  trackId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("audio_objects")
    .select("object_key, kind")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  return pickPlaybackObjectKey(rows);
}

export async function listDemoLibraries(supabase: SupabaseClient): Promise<Library[]> {
  const { data, error } = await supabase
    .from("libraries")
    .select("id, name, source, created_at, updated_at")
    .eq("source", "demo")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listDemoLibraryTracks(
  supabase: SupabaseClient,
): Promise<{ tracks: Track[]; objectKeys: Map<string, string> }> {
  const libraries = await listDemoLibraries(supabase);
  const ids = libraries.map((library) => library.id);
  if (ids.length === 0) return { tracks: [], objectKeys: new Map() };
  const { data, error } = await supabase
    .from("tracks")
    .select(TRACK_SELECT)
    .in("library_id", ids)
    .order("artist", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  const objectKeys = new Map<string, string>();
  const tracks = ((data ?? []) as TrackRow[]).map((row) => {
    const audioObjects = restrictDemoAudioObjects(row.audio_objects);
    const objectKey = pickPlaybackObjectKey(audioObjects);
    const track = mapTrackRow({ ...row, audio_objects: audioObjects });
    if (objectKey) objectKeys.set(track.id, objectKey);
    return track;
  });
  return { tracks: await applyGenreIslandProjection(supabase, tracks), objectKeys };
}

export async function demoPlaybackObjectKey(
  supabase: SupabaseClient,
  trackId: string,
): Promise<string | null> {
  const id = trackId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("tracks")
    .select(
      `
      id,
      libraries!inner ( source ),
      audio_objects ( kind, object_key )
    `,
    )
    .eq("id", id)
    .eq("libraries.source", "demo")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return pickPlaybackObjectKey(
    restrictDemoAudioObjects(
      (data as { audio_objects?: { kind: string; object_key: string }[] }).audio_objects,
    ),
  );
}
