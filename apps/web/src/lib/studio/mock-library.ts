import fixture from "@/data/synthetic-tracks-3k.json";
import { CLUSTER_COPY } from "./constants";
import type { Crate, Energy, Mood, StudioTrack, Texture } from "./types";

type Raw = {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  key: string;
  cluster: number;
  clusterName: string;
  mood: string;
  umap_x: number;
  umap_y: number;
  suggestedMoment: string;
};

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function unit(h: number, salt: number): number {
  return ((h ^ Math.imul(salt, 2654435761)) >>> 0) / 4294967295;
}

const TEXTURE_BY_CLUSTER: Record<number, Texture[]> = {
  [-1]: ["raw"],
  0: ["percussive"],
  1: ["atmospheric", "minimal"],
  2: ["raw", "percussive"],
  3: ["atmospheric", "vocal"],
  4: ["atmospheric", "minimal"],
  5: ["raw", "percussive"],
  6: ["atmospheric", "vocal"],
  7: ["raw", "minimal"],
  8: ["percussive", "raw"],
  9: ["vocal", "atmospheric"],
  10: ["atmospheric", "percussive"],
  11: ["minimal", "percussive"],
};

function texturesFor(cluster: number): Texture[] {
  const base = TEXTURE_BY_CLUSTER[cluster] ?? ["minimal"];
  return base.filter((t): t is Texture =>
    t === "raw" || t === "atmospheric" || t === "minimal" || t === "percussive" || t === "vocal",
  );
}

function energyFor(moment: string, h: number): Energy {
  if (moment.startsWith("Peak")) return "peak";
  if (moment.startsWith("Main")) return unit(h, 3) > 0.45 ? "driving" : "peak";
  if (moment.startsWith("Deep") || moment.startsWith("Sunrise")) return "low";
  if (moment.startsWith("Sunset")) return "medium";
  return unit(h, 4) > 0.5 ? "medium" : "driving";
}

function genreFor(cluster: number, mood: Mood): string {
  if (cluster === 4 || cluster === 11) return "Dub techno";
  if (cluster === 2) return "Peak techno";
  if (cluster === 3 || cluster === 10) return "Ambient house";
  if (cluster === 1) return "Afterhours";
  if (mood === "warm") return "Deep house";
  if (mood === "dark") return "Hypnotic techno";
  return "House";
}

function enrich(raw: Raw): StudioTrack {
  const h = hash(raw.id);
  const mood = (raw.mood as Mood) || "warm";
  const cluster = raw.cluster;
  const named = CLUSTER_COPY[cluster]?.name ?? raw.clusterName;
  const textures = texturesFor(cluster);
  const tags = [mood, ...textures].slice(0, 4);
  const n = Number(raw.id.replace(/\D/g, "")) || 0;

  const track: StudioTrack = {
    id: raw.id,
    title: raw.title,
    artist: raw.artist,
    bpm: raw.bpm,
    key: raw.key || null,
    genre: genreFor(cluster, mood),
    mood,
    energy: energyFor(raw.suggestedMoment, h),
    textures,
    durationSec: 208 + Math.floor(unit(h, 1) * 220),
    year: 2018 + Math.floor(unit(h, 2) * 8),
    label: unit(h, 5) > 0.5 ? "Basalt" : "Harbour Editions",
    cluster,
    clusterName: named,
    suggestedMoment: raw.suggestedMoment,
    umap_x: raw.umap_x,
    umap_y: raw.umap_y,
    tags,
    analysisStatus: "ok",
    previewState: "ready",
    loudnessLufs: -14 - unit(h, 6) * 6,
    energyScore: 3 + unit(h, 7) * 7,
  };

  if (n === 1) {
    track.title =
      "This Is A Very Long Dub Mix Title With Parenthetical Remaster Notes And A Featured Artist";
  }
  if (n === 2) {
    track.artist = "Björk / 坂本龍一 / Anaïs Kerr";
    track.title = "Salt Flats (Dub)";
  }
  if (n === 3) {
    track.title = "Untitled cassette rip";
    track.artist = "Unknown artist";
    track.bpm = null;
    track.key = null;
    track.genre = "";
    track.analysisStatus = "missing-metadata";
    track.loudnessLufs = null;
  }
  if (n === 4) {
    track.analysisStatus = "failed";
    track.previewState = "failed";
    track.bpm = null;
    track.key = null;
    track.loudnessLufs = null;
    track.energyScore = null;
  }
  if (n === 5) {
    track.analysisStatus = "duplicate";
    track.title = `${track.title} (copy)`;
  }
  if (n === 6) {
    track.previewState = "expired";
  }
  if (n === 7) {
    track.previewState = "missing";
  }

  return track;
}

let cache: { tracks: StudioTrack[]; crates: Crate[] } | null = null;

export function getMockLibrary(): { tracks: StudioTrack[]; crates: Crate[] } {
  if (cache) return cache;
  const tracks = (fixture.tracks as Raw[]).map(enrich);
  const byName = (re: RegExp) => tracks.find((t) => re.test(t.title) && t.analysisStatus === "ok");
  const seedish =
    tracks.find((t) => t.title === "Nocturne Transit") ??
    tracks.find((t) => t.cluster === 0 && t.bpm && t.bpm >= 120 && t.bpm <= 124) ??
    tracks[12];
  const crateIds = [
    seedish.id,
    tracks[40]?.id,
    tracks[80]?.id,
    tracks[120]?.id,
    byName(/Low Ceiling/)?.id,
    tracks[200]?.id,
  ].filter(Boolean) as string[];

  cache = {
    tracks,
    crates: [
      {
        id: "sunset-lounge",
        name: "Sunset lounge",
        trackIds: crateIds.slice(0, 4),
        intention: "Warm handover into the main room",
        room: "Lounge / terrace",
        timeOfDay: "Sunset",
      },
      {
        id: "warm-up",
        name: "Warm-up",
        trackIds: tracks.filter((t) => t.cluster === 0).slice(0, 6).map((t) => t.id),
        intention: "First hour, keep the floor walking in",
        room: "Main",
        timeOfDay: "Early",
      },
      {
        id: "peak-time",
        name: "Peak-time",
        trackIds: tracks.filter((t) => t.energy === "peak").slice(0, 5).map((t) => t.id),
        intention: "Hold energy without slamming",
        room: "Main",
        timeOfDay: "Peak",
      },
      {
        id: "afterhours",
        name: "Afterhours",
        trackIds: tracks.filter((t) => t.cluster === 1).slice(0, 5).map((t) => t.id),
        intention: "Darker, lower, still moving",
        room: "Second room",
        timeOfDay: "Late",
      },
    ],
  };
  return cache;
}

export function findNocturne(tracks: StudioTrack[]): StudioTrack | undefined {
  return (
    tracks.find((t) => t.title.toLowerCase().includes("nocturne")) ??
    tracks.find((t) => t.cluster === 0 && (t.bpm ?? 0) >= 120 && (t.bpm ?? 0) <= 124)
  );
}
