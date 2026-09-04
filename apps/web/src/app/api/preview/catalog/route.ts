import { jsonError, notConfigured, notFound } from "@/lib/cloud/http";
import { isDemoPreviewApiEnabled } from "@/lib/preview/access";
import { loadDemoPreviewCatalog, previewCatalogConfigured } from "@/lib/preview/r2-library";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDemoPreviewApiEnabled()) {
    return notFound("Preview catalog is not available in local mode.");
  }
  if (!previewCatalogConfigured()) {
    return notConfigured(
      "Preview demo catalog",
      "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY. Seed the source=demo library.",
    );
  }
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const { libraries, tracks } = await loadDemoPreviewCatalog(refresh);
    return Response.json({
      library: libraries[0] ?? {
        id: "preview-demo",
        name: "Demo library",
        source: "demo",
      },
      tracks,
    });
  } catch (error) {
    const message = catalogErrorMessage(error);
    console.error("[preview/catalog]", message, error);
    return jsonError(
      {
        code: "CLOUD_QUERY_FAILED",
        message,
        retryable: true,
      },
      500,
    );
  }
}

function catalogErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Could not load the demo catalog.";
}
