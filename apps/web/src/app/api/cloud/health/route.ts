import { requireApiAccess } from "@/lib/cloud/access";
import { notConfigured } from "@/lib/cloud/http";
import { getR2Config } from "@/lib/r2/env";
import { getSupabasePublishableEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  const r2 = Boolean(getR2Config());
  const supabase = Boolean(getSupabasePublishableEnv());
  if (!r2) {
    return notConfigured("Cloud object storage");
  }
  return Response.json({
    ok: r2 && supabase,
    runtime: "cloud",
    r2,
    supabase,
  });
}
