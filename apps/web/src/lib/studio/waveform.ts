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
