import { requireApiAccess } from "@/lib/cloud/access";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import { notConfigured } from "@/lib/cloud/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  _context: { params: Promise<{ trackId: string }> },
) {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  const channel =
    new URL(request.url).searchParams.get("channel") ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL;
  void channel;
  return notConfigured("Loading cloud recommendations");
}
