import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import { jsonError, notFound } from "@/lib/cloud/http";
import { isDemoPreviewApiEnabled } from "@/lib/preview/access";
import { listSonicNeighbors } from "@/lib/similarity/list-neighbors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ trackId: string }> },
) {
  if (!isDemoPreviewApiEnabled()) {
    return notFound("Preview neighbors are not available in local mode.");
  }
  const { trackId } = await context.params;
  if (!trackId) return notFound("That track was not found.");
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "80");
  const channel = url.searchParams.get("channel") ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL;
  try {
    const { neighbors, source } = await listSonicNeighbors(trackId, {
      limit: Number.isFinite(limit) ? limit : 80,
      channel,
      prefer: "sqlite",
    });
    return Response.json({ neighbors, channel, source });
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not load similar tracks.",
        retryable: true,
      },
      500,
    );
  }
}
