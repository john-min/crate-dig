import { getPublicAppMode } from "@/lib/env";

/** Public demo catalog/playback. Local disk mode keeps using the sidecar instead. */
export function isDemoPreviewApiEnabled(): boolean {
  return getPublicAppMode() !== "local";
}
