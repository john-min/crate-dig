import { BPM_BOUNDS, type BpmBounds } from "@crate-dig/app-core";
import type { Energy, Mood, StudioFilters, Texture } from "./types";

const MOODS: Mood[] = ["warm", "euphoric", "dark", "dreamy", "hypnotic"];
const TEXTURES: Texture[] = ["raw", "atmospheric", "minimal", "percussive", "vocal"];
const ENERGIES: Energy[] = ["low", "medium", "peak", "driving"];

export function looksLikeQAsk(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/\b(find|around|warmer|darker|raise|energy|percussive|similar|after this)\b/i.test(text)) {
    return true;
  }
  return text.split(/\s+/).length >= 5;
}

export function interpretQPrompt(
  prompt: string,
  bounds: BpmBounds = BPM_BOUNDS,
): {
  filters: Partial<StudioFilters>;
  evidence: string[];
} {
  const text = prompt.toLowerCase();
  const filters: Partial<StudioFilters> = {};
  const evidence: string[] = [];

  const bpmMatch = text.match(/around\s+(\d{2,3})/) ?? text.match(/(\d{2,3})\s*bpm/);
  if (bpmMatch) {
    const center = Number(bpmMatch[1]);
    filters.bpmMin = Math.max(bounds.min, center - 4);
    filters.bpmMax = Math.min(bounds.max, center + 4);
    evidence.push(`${center} BPM ±4`);
  }

  const keyMatch = prompt.toUpperCase().match(/\b(\d{1,2}[AB])\b/);
  if (keyMatch) {
    filters.keys = [keyMatch[1]];
    evidence.push(keyMatch[1]);
  }

  const moods = MOODS.filter((mood) => text.includes(mood));
  if (/\bdarker\b/.test(text) && !moods.includes("dark")) moods.push("dark");
  if (moods.length) {
    filters.moods = moods;
  }

  const textures = TEXTURES.filter((texture) => text.includes(texture));
  if (textures.length) filters.textures = textures;

  if (/\braise energy|peak|driving\b/.test(text)) {
    filters.energies = ["peak", "driving"] as Energy[];
  } else {
    const energies = ENERGIES.filter((energy) => text.includes(energy));
    if (energies.length) filters.energies = energies;
  }

  const vibeBits = [...(filters.moods ?? []), ...(filters.textures ?? [])];
  if (vibeBits.length) evidence.push(vibeBits.join(" · "));
  evidence.push("colored by mood");

  return { filters, evidence };
}
