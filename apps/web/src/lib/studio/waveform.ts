/** Deterministic 0..1 waveform peaks for a track id. Visual only — not measured audio. */
export function waveformPeaks(id: string, count = 96): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (i + 13), 16777619);
    const envelope = 0.35 + 0.65 * Math.sin((i / count) * Math.PI);
    const n = ((h >>> 0) % 1000) / 1000;
    peaks.push(Math.min(1, Math.max(0.08, envelope * (0.35 + n * 0.65))));
  }
  return peaks;
}

/** Schematic intensity over the record — not a measured energy envelope. */
export function energyCurvePeaks(id: string, energyScore: number | null, count = 56): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const level = energyScore != null ? Math.max(0.18, Math.min(1, energyScore / 10)) : 0.55;
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (i + 29), 16777619);
    const t = i / (count - 1);
    const intro = 0.28 + 0.5 * Math.min(1, t / 0.22);
    const breakDip = t > 0.42 && t < 0.58 ? 0.55 : 1;
    const outro = t > 0.78 ? 1 - (t - 0.78) / 0.22 * 0.45 : 1;
    const n = ((h >>> 0) % 1000) / 1000;
    peaks.push(Math.max(0.08, Math.min(1, intro * breakDip * outro * level * (0.72 + n * 0.28))));
  }
  return peaks;
}
