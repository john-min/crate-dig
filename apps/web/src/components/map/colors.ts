import type { PlotTrack, Rgba } from "./types";

/** Sonic accents from the foundations sheet — musical meaning, not decoration. */

const MOOD_RGB: Record<string, [number, number, number]> = {
  warm: [233, 166, 60],
  euphoric: [182, 123, 253],
  dark: [90, 188, 235],
  dreamy: [169, 198, 74],
  hypnotic: [72, 191, 212],
};

const OUTLIER: [number, number, number] = [35, 39, 47];
const DIM: [number, number, number] = [23, 26, 32];
const FIELD_GRAY: [number, number, number] = [78, 84, 96];

/** Mix field dots toward gray so cluster hues stay as a whisper. */
export const FIELD_DESATURATE = 0.45;
export const FIELD_FILL_ALPHA = 168;
export const NEIGHBOR_FILL_ALPHA = 230;
export const GLOW_FILL_ALPHA = 20;
export const DIM_FILL_ALPHA = 48;

export const HIGHLIGHT = {
  selected: [247, 249, 255] as [number, number, number],
  playing: [233, 166, 60] as [number, number, number],
  seed: [233, 166, 60] as [number, number, number],
};

export function clusterRgb(cluster: number): [number, number, number] {
  if (cluster < 0) return OUTLIER;
  const hue = (cluster * 137.508 + 22) % 360;
  const sat = 0.46 + ((cluster * 7) % 11) / 70;
  const light = 0.56 + ((cluster * 5) % 9) / 80;
  return hslToRgb(hue, sat, light);
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
  return [...DIM, DIM_FILL_ALPHA];
}

export function fieldFill(
  track: PlotTrack,
  colorBy: "cluster" | "mood" | "energy" | "similarity",
  score?: number | null,
): Rgba {
  const [r, g, b] = trackFill(track, colorBy, 255, score);
  return [...desaturateRgb([r, g, b], FIELD_DESATURATE), FIELD_FILL_ALPHA];
}

export function neighborFill(
  track: PlotTrack,
  colorBy: "cluster" | "mood" | "energy" | "similarity",
  score?: number | null,
): Rgba {
  return trackFill(track, colorBy === "cluster" ? "similarity" : colorBy, NEIGHBOR_FILL_ALPHA, score ?? 1);
}

export function glowFill(
  track: PlotTrack,
  colorBy: "cluster" | "mood" | "energy" | "similarity",
  score?: number | null,
  alpha = GLOW_FILL_ALPHA,
): Rgba {
  const [r, g, b] = neighborFill(track, colorBy, score);
  return [r, g, b, alpha];
}

function desaturateRgb(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  const gray = FIELD_GRAY;
  return [
    Math.round(rgb[0] + (gray[0] - rgb[0]) * amount),
    Math.round(rgb[1] + (gray[1] - rgb[1]) * amount),
    Math.round(rgb[2] + (gray[2] - rgb[2]) * amount),
  ];
}

export function cssRgb(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
