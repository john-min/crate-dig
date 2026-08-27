import { notConfigured, notFound } from "@/lib/cloud/http";
import { getPublicAppMode } from "@/lib/env";
import { loadPreviewCatalog } from "@/lib/preview/r2-library";
import {
  previewCatalogTrackFromTags,
  type PreviewTagRecord,
} from "@/lib/preview/studio-from-tags";
import { getR2Config } from "@/lib/r2/env";
import tagCatalog from "@/data/preview-track-studio.json";

export const runtime = "nodejs";

function isOpenPreviewMode(): boolean {
  const mode = getPublicAppMode();
  return mode === "preview" || mode === "mock";
}

export async function GET() {
  if (!isOpenPreviewMode()) {
    return notFound("Preview catalog is only available in preview/mock mode.");
  }
  if (!getR2Config()) {
    return notConfigured(
      "Preview R2 catalog",
      "Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_AUDIO, and R2_ACCOUNT_ID or R2_ENDPOINT.",
    );
  }
  const entries = await loadPreviewCatalog();
  const tagsById = tagCatalog as Record<string, PreviewTagRecord>;
  return Response.json({
    tracks: entries.map((entry) =>
      previewCatalogTrackFromTags(entry, tagsById[entry.id] ?? {}),
    ),
  });
}
