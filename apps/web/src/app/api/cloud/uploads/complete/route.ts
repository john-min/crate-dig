import { requireApiAccess } from "@/lib/cloud/access";
import { badRequest, conflict, jsonError, notConfigured, notFound } from "@/lib/cloud/http";
import { completeSignedUpload } from "@/lib/cloud/uploads";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;

  let body: { uploadId?: string; objectKey?: string; etag?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("Expected a JSON upload completion body.");
  }

  if (!body.uploadId || !body.objectKey) {
    return badRequest("uploadId and objectKey are required.");
  }

  try {
    const supabase = await createClient();
    const completed = await completeSignedUpload(supabase, gate.access.user.id, {
      uploadId: body.uploadId,
      objectKey: body.objectKey,
      etag: body.etag,
    });
    return Response.json(completed);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : "Could not complete the cloud upload.";
    if (code === "CLOUD_NOT_CONFIGURED") return notConfigured("Completing a cloud upload");
    if (code === "CLOUD_NOT_FOUND") return notFound(message);
    if (code === "CLOUD_BAD_REQUEST") return badRequest(message);
    if (code === "CLOUD_UPLOAD_EXPIRED" || code === "CLOUD_UPLOAD_INCOMPLETE") {
      return conflict(message);
    }
    return jsonError(
      {
        code: code || "CLOUD_UPLOAD_FAILED",
        message,
        retryable: false,
      },
      500,
    );
  }
}
