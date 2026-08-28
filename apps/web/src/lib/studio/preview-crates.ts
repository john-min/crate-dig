import type { Crate } from "./types";

export const PREVIEW_CRATES_KEY = "cd.preview.crates";
export const PREVIEW_CRATES_VERSION = 1;

function isStoredCrate(value: unknown): value is Crate {
  if (!value || typeof value !== "object") return false;
  const crate = value as Partial<Crate>;
  return typeof crate.id === "string" && crate.id.length > 0 && Array.isArray(crate.trackIds);
}

export function serializePreviewCrateState(crates: Crate[], activeCrateId: string): string {
  return JSON.stringify({ v: PREVIEW_CRATES_VERSION, crates, activeCrateId });
}

export function readPreviewCrateState(
  raw: string | null,
  fallbackActiveId: string,
): { crates: Crate[]; activeCrateId: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    let crates: Crate[] = [];
    let activeCrateId = fallbackActiveId;
    if (Array.isArray(parsed)) {
      crates = parsed.filter(isStoredCrate);
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { crates?: unknown }).crates)) {
      crates = ((parsed as { crates: unknown[] }).crates).filter(isStoredCrate);
      const storedId = (parsed as { activeCrateId?: unknown }).activeCrateId;
      if (typeof storedId === "string" && storedId) activeCrateId = storedId;
    }
    if (crates.length === 0) return null;
    if (!crates.some((crate) => crate.id === activeCrateId)) {
      activeCrateId = crates[0]?.id ?? fallbackActiveId;
    }
    return { crates, activeCrateId };
  } catch {
    return null;
  }
}
