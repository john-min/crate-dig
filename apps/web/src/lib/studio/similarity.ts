import type { SimilarityReason, StudioTrack } from "./types";
import { keysCompatible } from "./format";

export function similarityScore(seed: StudioTrack, other: StudioTrack): number {
  const dx = seed.umap_x - other.umap_x;
  const dy = seed.umap_y - other.umap_y;
  const dist = Math.hypot(dx, dy);
  const spatial = Math.max(0, 1 - dist / 4.8);
  let bonus = 0;
  if (seed.mood === other.mood) bonus += 0.04;
  if (seed.cluster === other.cluster && seed.cluster >= 0) bonus += 0.05;
  if (keysCompatible(seed.key, other.key)) bonus += 0.04;
  if (seed.bpm != null && other.bpm != null) {
    const d = Math.abs(seed.bpm - other.bpm);
    bonus += d <= 2 ? 0.04 : d <= 4 ? 0.02 : 0;
  }
  const sharedTex = seed.textures.filter((t) => other.textures.includes(t)).length;
  bonus += Math.min(0.04, sharedTex * 0.02);
  return Math.min(0.99, Math.round((spatial * 0.86 + bonus) * 100) / 100);
}

export function reasonStack(seed: StudioTrack, other: StudioTrack, score: number): SimilarityReason[] {
  const reasons: SimilarityReason[] = [];
  const shared = seed.textures.filter((t) => other.textures.includes(t));
  if (shared.includes("percussive")) {
    reasons.push({ label: "Shared rolling percussion", kind: "shared" });
  } else if (shared.includes("atmospheric")) {
    reasons.push({ label: "Shared atmospheric space", kind: "shared" });
  } else if (shared.length) {
    reasons.push({ label: `Shared ${shared[0]} texture`, kind: "shared" });
  }

  if (seed.bpm != null && other.bpm != null) {
    reasons.push({
      label: `${Math.round(other.bpm)} BPM vs ${Math.round(seed.bpm)} BPM`,
      kind: Math.abs(seed.bpm - other.bpm) <= 4 ? "distance" : "warning",
    });
  }

  if (seed.key && other.key) {
    const same = seed.key === other.key;
    const compatible = keysCompatible(seed.key, other.key);
    reasons.push({
      label: same
        ? `Same key: ${other.key}`
        : compatible
          ? `Compatible key: ${seed.key} → ${other.key}`
          : `Key jump: ${seed.key} → ${other.key}`,
      kind: same || compatible ? "compatible" : "warning",
    });
  }

  if (seed.mood === other.mood) {
    reasons.push({ label: `Same ${seed.mood} mood`, kind: "shared" });
  } else if (other.mood === "dark" && seed.mood === "warm") {
    reasons.push({ label: "Slightly darker vocal texture", kind: "distance" });
  } else {
    reasons.push({ label: `${seed.mood} → ${other.mood} mood shift`, kind: "distance" });
  }

  if (Math.abs((seed.energyScore ?? 5) - (other.energyScore ?? 5)) <= 1.5) {
    reasons.push({ label: "Similar low-mid weight", kind: "shared" });
  }

  if (score < 0.72) {
    reasons.push({
      label: "Risky blend — preview before it goes in a crate",
      kind: "warning",
    });
  }

  return reasons.slice(0, 5);
}

export function nearbyTracks(seed: StudioTrack, library: StudioTrack[], limit = 24): StudioTrack[] {
  return library
    .filter((t) => t.id !== seed.id && t.analysisStatus !== "failed" && !t.hiddenFromRecs)
    .map((t) => ({ t, s: similarityScore(seed, t) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}
