import { jsonError, notConfigured, notFound } from "@/lib/cloud/http";
import { isDemoPreviewApiEnabled } from "@/lib/preview/access";
import { loadDemoPreviewCatalog, previewCatalogConfigured } from "@/lib/preview/r2-library";

export const runtime = "nodejs";

export async function GET() {
  if (!isDemoPreviewApiEnabled()) {
    return notFound("Preview catalog is not available in local mode.");
  }
  if (!previewCatalogConfigured()) {
    return notConfigured(
      "Preview demo catalog",
      "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY. Seed the source=demo library.",
    );
  }
  try {
    const { libraries, tracks } = await loadDemoPreviewCatalog();
    return Response.json({
      library: libraries[0] ?? {
        id: "preview-demo",
        name: "Demo library",
        source: "demo",
      },
      tracks,
    });
  } catch (error) {
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message: error instanceof Error ? error.message : "Could not load the demo catalog.",
        retryable: true,
      },
      500,
    );
  }
}
