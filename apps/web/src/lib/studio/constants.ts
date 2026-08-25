import type { Energy, Mood, Texture } from "./types";

export const BPM_BOUNDS = { min: 108, max: 136 } as const;
export const MODEL_VERSION = "fast-librosa · pipeline 2026.08";
export const LIBRARY_TOTAL = 3000;

export const CLUSTER_COPY: Record<number, { name: string; blurb: string }> = {
  [-1]: {
    name: "Outliers / one-offs",
    blurb: "These records sit between clusters. Tempo may match a neighbor, but timbre or top-end pulls them elsewhere.",
  },
  0: {
    name: "Warm Rollers",
    blurb: "Mostly 118–124 BPM · warm, percussive, low-mid focused. Good for warm-up, lounge, and early handover moments.",
  },
  1: {
    name: "Afterhours Deep",
    blurb: "Slower pressure, darker rooms. Low-end weight over sparkle — late sets and come-down crates.",
  },
  2: {
    name: "Neon Peak",
    blurb: "Brighter top end and higher energy. Peak-time records that still share the house/techno grid.",
  },
  3: {
    name: "Dream Sequence",
    blurb: "Softened transients, washed harmonics. Ambient edges and sunrise opens.",
  },
  4: {
    name: "Dub Chamber",
    blurb: "Low-mid fog, delayed percussion, restrained vocals. Sits next to Warm Rollers with more space.",
  },
  5: {
    name: "Coral Drive",
    blurb: "Rawer kick and clipped hats. Driving records for the second room.",
  },
  6: {
    name: "Lounge Drift",
    blurb: "Lower energy, longer tails. Sunset and golden-hour crates.",
  },
  7: {
    name: "Steel Warehouse",
    blurb: "Drier rooms, industrial mids. Tougher than Warm Rollers, less peaky than Neon Peak.",
  },
  8: {
    name: "Fog & Percussion",
    blurb: "Broken drums and haze. Texture-led rather than genre-led.",
  },
  9: {
    name: "Violet Dusk",
    blurb: "Euphoric but not peak. Handover records between warm-up and main floor.",
  },
  10: {
    name: "Lime Rollers",
    blurb: "Dreamier rollers with a brighter pad bed. Adjacent to Dream Sequence.",
  },
  11: {
    name: "Cyan Pulse",
    blurb: "Hypnotic pulse, restrained brightness. Holds a floor without lifting it.",
  },
};

export const MOODS: Mood[] = ["warm", "euphoric", "dark", "dreamy", "hypnotic"];
export const ENERGIES: Energy[] = ["low", "medium", "peak", "driving"];
export const TEXTURES: Texture[] = ["raw", "atmospheric", "minimal", "percussive", "vocal"];

export const MOOD_LEGEND: { key: Mood; label: string; swatch: string }[] = [
  { key: "warm", label: "warm", swatch: "#E9A63C" },
  { key: "euphoric", label: "euphoric", swatch: "#B67BFD" },
  { key: "dark", label: "dark", swatch: "#5ABCEB" },
  { key: "dreamy", label: "dreamy", swatch: "#A9C64A" },
  { key: "hypnotic", label: "hypnotic", swatch: "#48BFD4" },
];

export const EMPTY_FILTERS = {
  query: "",
  bpmMin: BPM_BOUNDS.min,
  bpmMax: BPM_BOUNDS.max,
  keys: [] as string[],
  moods: [] as Mood[],
  energies: [] as Energy[],
  textures: [] as Texture[],
  compatibleKeys: false,
  bpmNearSeed: false,
};
