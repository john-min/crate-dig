import { requireApiAccess } from "@/lib/cloud/access";
import { badRequest, jsonError, notConfigured, notFound } from "@/lib/cloud/http";
import { createSignedUploadSession } from "@/lib/cloud/uploads";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;

  let body: {
    libraryId?: string;
    fileName?: string;
    contentType?: string;
    sizeBytes?: number;
    sha256?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("Expected a JSON upload session body.");
  }

  if (!body.fileName || !body.contentType || body.sizeBytes == null) {
    return badRequest("fileName, contentType, and sizeBytes are required.");
  }

  try {
    const supabase = await createClient();
    const session = await createSignedUploadSession(supabase, gate.access.user.id, {
      libraryId: body.libraryId ?? "",
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: Number(body.sizeBytes),
      sha256: body.sha256,
    });
    return Response.json(session);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "CLOUD_NOT_CONFIGURED") return notConfigured("Creating a signed cloud upload");
    if (code === "CLOUD_NOT_FOUND") return notFound(error instanceof Error ? error.message : "That library was not found.");
    if (code === "CLOUD_UNSUPPORTED_TYPE" || code === "CLOUD_BAD_REQUEST" || code === "CLOUD_TOO_LARGE") {
      return badRequest(error instanceof Error ? error.message : "Invalid upload request.", code);
    }
    return jsonError(
      {
        code: code || "CLOUD_UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Could not create a signed upload.",
        retryable: false,
      },
      500,
    );
  }
}
