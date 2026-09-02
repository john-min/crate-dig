import type { Energy, Mood, Texture } from "@crate-dig/app-core";

export const MOODS: Mood[] = ["warm", "euphoric", "dark", "dreamy", "hypnotic"];
export const ENERGIES: Energy[] = ["low", "medium", "peak", "driving"];
export const TEXTURES: Texture[] = ["raw", "atmospheric", "minimal", "percussive", "vocal"];

export const MOOD_COLORS: Record<Mood, string> = {
  warm: "#E9A63C",
  euphoric: "#8B7BF0",
  dark: "#5A8CE8",
  dreamy: "#A9C64A",
  hypnotic: "#48BFD4",
};

export const ENERGY_COLORS: Record<Energy, string> = {
  low: "#6B7383",
  medium: "#5A8CE8",
  peak: "#E9A63C",
  driving: "#8B7BF0",
};
