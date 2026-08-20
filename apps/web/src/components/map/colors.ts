import type { PlotTrack, Rgba } from "./types";

/** Muted sonic accents on graphite — cluster identity, not neon decoration. */
const CLUSTER_RGB: Record<number, [number, number, number]> = {
  0: [196, 154, 98],
  1: [92, 108, 138],
  2: [176, 102, 92],
  3: [138, 122, 168],
  4: [90, 138, 148],
  5: [186, 122, 96],
  6: [168, 142, 108],
  7: [118, 96, 108],
  8: [108, 132, 116],
  9: [124, 108, 148],
  10: [148, 158, 96],
  11: [96, 148, 164],
};

const MOOD_RGB: Record<string, [number, number, number]> = {
  warm: [196, 154, 98],
  euphoric: [176, 102, 92],
  dark: [92, 108, 138],
  dreamy: [138, 122, 168],
  hypnotic: [90, 138, 148],
};

const OUTLIER: [number, number, number] = [92, 90, 86];
const DIM: [number, number, number] = [72, 70, 66];

export const HIGHLIGHT = {
  selected: [232, 224, 210] as [number, number, number],
  playing: [212, 176, 106] as [number, number, number],
  seed: [212, 176, 106] as [number, number, number],
};

export function clusterRgb(cluster: number): [number, number, number] {
  if (cluster < 0) return OUTLIER;
  return CLUSTER_RGB[cluster] ?? CLUSTER_RGB[cluster % 12] ?? OUTLIER;
}

export function moodRgb(mood: string): [number, number, number] {
  return MOOD_RGB[mood.toLowerCase()] ?? OUTLIER;
}

export function trackFill(
  track: PlotTrack,
  colorBy: "cluster" | "mood",
  alpha = 210,
): Rgba {
  const rgb = colorBy === "mood" ? moodRgb(track.mood) : clusterRgb(track.cluster);
  return [...rgb, alpha];
}

export function dimFill(): Rgba {
  return [...DIM, 72];
}

export function glowFill(track: PlotTrack, colorBy: "cluster" | "mood"): Rgba {
  const rgb = colorBy === "mood" ? moodRgb(track.mood) : clusterRgb(track.cluster);
  return [...rgb, 28];
}

export function cssRgb(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
