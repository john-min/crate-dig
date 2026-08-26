import { requireApiAccess } from "@/lib/cloud/access";
import { jsonError } from "@/lib/cloud/http";
import { listOwnedTracks } from "@/lib/cloud/records";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const libraryId = url.searchParams.get("libraryId") ?? undefined;
  const query = url.searchParams.get("query") ?? undefined;
  const limitValue = url.searchParams.get("limit");
  const offsetValue = url.searchParams.get("offset");
  try {
    const supabase = await createClient();
    const tracks = await listOwnedTracks(supabase, {
      libraryId,
      query,
      limit: limitValue ? Number(limitValue) : undefined,
      offset: offsetValue ? Number(offsetValue) : undefined,
    });
    return Response.json({ tracks });
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not list cloud tracks.",
        retryable: true,
      },
      500,
    );
  }
}
