import { notConfigured, notFound } from "@/lib/cloud/http";
import { getPublicAppMode } from "@/lib/env";
import { previewObjectKeyForTrackId } from "@/lib/preview/r2-library";
import { getR2Config } from "@/lib/r2/env";
import { presignR2Get } from "@/lib/r2/client";

export const runtime = "nodejs";

function isOpenPreviewMode(): boolean {
  const mode = getPublicAppMode();
  return mode === "preview" || mode === "mock";
}

export async function GET(request: Request) {
  if (!isOpenPreviewMode()) {
    return notFound("Preview playback is only available in preview/mock mode.");
  }

  const trackId = new URL(request.url).searchParams.get("trackId")?.trim() ?? "";
  const objectKey = trackId ? await previewObjectKeyForTrackId(trackId) : null;
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
