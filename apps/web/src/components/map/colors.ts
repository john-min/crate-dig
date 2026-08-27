import type { PlotTrack, Rgba } from "./types";

/** Sonic accents from the foundations sheet — musical meaning, not decoration. */
const CLUSTER_RGB: Record<number, [number, number, number]> = {
  0: [233, 166, 60],
  1: [90, 188, 235],
  2: [228, 120, 90],
  3: [169, 198, 74],
  4: [72, 191, 212],
  5: [228, 120, 90],
  6: [233, 166, 60],
  7: [90, 188, 235],
  8: [72, 191, 212],
  9: [182, 123, 253],
  10: [169, 198, 74],
  11: [72, 191, 212],
};

const MOOD_RGB: Record<string, [number, number, number]> = {
  warm: [233, 166, 60],
  euphoric: [182, 123, 253],
  dark: [90, 188, 235],
  dreamy: [169, 198, 74],
  hypnotic: [72, 191, 212],
};

const OUTLIER: [number, number, number] = [35, 39, 47];
const DIM: [number, number, number] = [23, 26, 32];

export const HIGHLIGHT = {
  selected: [247, 249, 255] as [number, number, number],
  playing: [233, 166, 60] as [number, number, number],
  seed: [233, 166, 60] as [number, number, number],
};

export function clusterRgb(cluster: number): [number, number, number] {
  if (cluster < 0) return OUTLIER;
  return CLUSTER_RGB[cluster] ?? CLUSTER_RGB[cluster % 12] ?? OUTLIER;
}

export function moodRgb(mood: string): [number, number, number] {
  return MOOD_RGB[mood.toLowerCase()] ?? OUTLIER;
}

const ENERGY_RGB: Record<string, [number, number, number]> = {
  low: [72, 191, 212],
  medium: [233, 166, 60],
  peak: [228, 120, 90],
  driving: [182, 123, 253],
};

export function energyRgb(energy: string): [number, number, number] {
  return ENERGY_RGB[energy] ?? OUTLIER;
}

export function trackFill(
  track: PlotTrack,
  colorBy: "cluster" | "mood" | "energy" | "similarity",
  alpha = 210,
  score?: number | null,
): Rgba {
  if (colorBy === "similarity") {
    const s = score ?? 0;
    const t = Math.max(0, Math.min(1, (s - 0.45) / 0.5));
    const r = Math.round(35 + (233 - 35) * t);
    const g = Math.round(39 + (166 - 39) * t);
    const b = Math.round(47 + (60 - 47) * t);
    return [r, g, b, alpha];
  }
  const rgb =
    colorBy === "mood"
      ? moodRgb(track.mood)
      : colorBy === "energy"
        ? energyRgb(track.energy)
        : clusterRgb(track.cluster);
  return [...rgb, alpha];
}

export function dimFill(): Rgba {
  return [...DIM, 72];
}

export function glowFill(
  track: PlotTrack,
  colorBy: "cluster" | "mood" | "energy" | "similarity",
  score?: number | null,
): Rgba {
  const [r, g, b] = trackFill(track, colorBy, 255, score);
  return [r, g, b, 36];
}

export function cssRgb(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
