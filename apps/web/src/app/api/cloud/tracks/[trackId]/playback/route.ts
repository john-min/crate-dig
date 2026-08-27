import { requireApiAccess } from "@/lib/cloud/access";
import { jsonError, notConfigured, notFound } from "@/lib/cloud/http";
import { originalObjectKey } from "@/lib/cloud/records";
import { getR2Config } from "@/lib/r2/env";
import { presignR2Get } from "@/lib/r2/client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ trackId: string }> },
) {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  const { trackId } = await context.params;
  if (!getR2Config()) return notConfigured("Creating a signed cloud playback URL");

  try {
    const supabase = await createClient();
    const objectKey = await originalObjectKey(supabase, trackId);
    if (!objectKey) return notFound("That track has no stored audio object.");
    const playback = presignR2Get({ objectKey });
    if (!playback) return notConfigured("Creating a signed cloud playback URL");
    return Response.json({ url: playback.url, expiresAt: playback.expiresAt });
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not sign cloud playback.",
        retryable: true,
      },
      500,
    );
  }
}
