import { jsonError, notConfigured, notFound } from "@/lib/cloud/http";
import { isDemoPreviewApiEnabled } from "@/lib/preview/access";
import { previewCatalogConfigured, previewObjectKeyForTrackId } from "@/lib/preview/r2-library";
import { getR2Config } from "@/lib/r2/env";
import { presignR2Get } from "@/lib/r2/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDemoPreviewApiEnabled()) {
    return notFound("Preview playback is not available in local mode.");
  }
  if (!previewCatalogConfigured()) {
    return notConfigured(
      "Preview demo playback",
      "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY.",
    );
  }

  const trackId = new URL(request.url).searchParams.get("trackId")?.trim() ?? "";
  let objectKey: string | null = null;
  try {
    objectKey = trackId ? await previewObjectKeyForTrackId(trackId) : null;
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not look up demo audio.",
        retryable: true,
      },
      500,
    );
  }
  if (!objectKey) {
    return Response.json({ url: "" });
  }
  if (!getR2Config()) {
    return notConfigured(
      "Preview R2 playback",
      "Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_AUDIO, and R2_ACCOUNT_ID or R2_ENDPOINT.",
    );
  }
  const playback = presignR2Get({ objectKey });
  if (!playback) {
    return notConfigured(
      "Preview R2 playback",
      "Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_AUDIO, and R2_ACCOUNT_ID or R2_ENDPOINT.",
    );
  }
  return Response.json({ url: playback.url, expiresAt: playback.expiresAt });
}
