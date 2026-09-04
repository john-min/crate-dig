export const NEBULA_SIZE = 256;
export const NEBULA_ICON = "glow";

export const NEBULA_MAPPING = {
  [NEBULA_ICON]: {
    x: 0,
    y: 0,
    width: NEBULA_SIZE,
    height: NEBULA_SIZE,
    anchorX: NEBULA_SIZE / 2,
    anchorY: NEBULA_SIZE / 2,
    mask: true,
  },
};

/** Soft radial wash used as an IconLayer atlas, tinted per genre. */
export function createNebulaAtlas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = NEBULA_SIZE;
  canvas.height = NEBULA_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const mid = NEBULA_SIZE / 2;
  const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  gradient.addColorStop(0, "rgba(255,255,255,0.18)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.07)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.025)");
  gradient.addColorStop(0.78, "rgba(255,255,255,0.008)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, NEBULA_SIZE, NEBULA_SIZE);
  return canvas;
}
