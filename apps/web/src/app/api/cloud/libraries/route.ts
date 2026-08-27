import { requireApiAccess } from "@/lib/cloud/access";
import { jsonError } from "@/lib/cloud/http";
import { listOwnedLibraries } from "@/lib/cloud/records";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  try {
    const supabase = await createClient();
    const libraries = await listOwnedLibraries(supabase);
    return Response.json({ libraries });
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not list cloud libraries.",
        retryable: true,
      },
      500,
    );
  }
}
