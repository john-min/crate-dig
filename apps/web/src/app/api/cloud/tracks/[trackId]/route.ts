import { requireApiAccess } from "@/lib/cloud/access";
import { jsonError, notFound } from "@/lib/cloud/http";
import { getOwnedTrack } from "@/lib/cloud/records";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ trackId: string }> },
) {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  const { trackId } = await context.params;
  try {
    const supabase = await createClient();
    const track = await getOwnedTrack(supabase, trackId);
    if (!track) return notFound("That track was not found.");
    return Response.json({ track });
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not load that cloud track.",
        retryable: true,
      },
      500,
    );
  }
}
