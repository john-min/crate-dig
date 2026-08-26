import "server-only";

import type { CompletedCloudUpload, SignedUploadSession } from "@crate-dig/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getR2Config } from "@/lib/r2/env";
import { headR2Object, presignR2Put } from "@/lib/r2/client";
import { ensureOwnedLibrary } from "@/lib/cloud/records";
import { isAllowedAudioType, MAX_UPLOAD_BYTES, sanitizeFileName } from "@/lib/cloud/audio";

export { MAX_UPLOAD_BYTES, isAllowedAudioType, sanitizeFileName };

export async function createSignedUploadSession(
  supabase: SupabaseClient,
  userId: string,
  input: {
    libraryId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256?: string;
  },
): Promise<SignedUploadSession> {
  if (!getR2Config()) {
    throw Object.assign(new Error("R2 is not configured."), { code: "CLOUD_NOT_CONFIGURED" });
  }
  if (!isAllowedAudioType(input.contentType)) {
    throw Object.assign(new Error("That file type is not a supported audio upload."), {
      code: "CLOUD_UNSUPPORTED_TYPE",
    });
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw Object.assign(new Error("Upload size must be greater than zero."), {
      code: "CLOUD_BAD_REQUEST",
    });
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("That file is larger than the 512 MiB upload limit."), {
      code: "CLOUD_TOO_LARGE",
    });
  }

  const library = await ensureOwnedLibrary(supabase, userId, input.libraryId);
  const fileName = sanitizeFileName(input.fileName);
  const sessionId = crypto.randomUUID();
  const objectKey = `libraries/${library.id}/originals/${sessionId}/${fileName}`;
  const signed = presignR2Put({ objectKey, contentType: input.contentType });
  if (!signed) {
    throw Object.assign(new Error("R2 is not configured."), { code: "CLOUD_NOT_CONFIGURED" });
  }

  const expiresAt = signed.expiresAt;
  const { error } = await supabase.from("upload_sessions").insert({
    id: sessionId,
    user_id: userId,
    library_id: library.id,
    object_key: objectKey,
    file_name: fileName,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    sha256: input.sha256 ?? null,
    status: "pending",
    expires_at: expiresAt,
  });
  if (error) throw error;

  return {
    uploadId: sessionId,
    objectKey,
    url: signed.url,
    method: "PUT",
    headers: signed.headers,
    expiresAt,
  };
}

export async function completeSignedUpload(
  supabase: SupabaseClient,
  userId: string,
  input: { uploadId: string; objectKey: string; etag?: string },
): Promise<CompletedCloudUpload> {
  const { data: session, error } = await supabase
    .from("upload_sessions")
    .select("id, user_id, library_id, object_key, file_name, content_type, size_bytes, status, expires_at, track_id")
    .eq("id", input.uploadId)
    .maybeSingle();
  if (error) throw error;
  if (!session || session.user_id !== userId) {
    throw Object.assign(new Error("That upload session was not found."), { code: "CLOUD_NOT_FOUND" });
  }
  if (session.object_key !== input.objectKey) {
    throw Object.assign(new Error("The upload object key does not match this session."), {
      code: "CLOUD_BAD_REQUEST",
    });
  }
  if (session.status === "completed" && session.track_id) {
    return {
      trackId: session.track_id,
      libraryId: session.library_id,
      objectKey: session.object_key,
    };
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await supabase.from("upload_sessions").update({ status: "expired" }).eq("id", session.id);
    throw Object.assign(new Error("That signed upload expired. Request a new upload URL."), {
      code: "CLOUD_UPLOAD_EXPIRED",
    });
  }

  const object = await headR2Object(session.object_key);
  if (!object.exists) {
    throw Object.assign(new Error("The audio object was not found in private storage."), {
      code: "CLOUD_UPLOAD_INCOMPLETE",
    });
  }

  const title = session.file_name.replace(/\.[^.]+$/, "") || session.file_name;
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .insert({
      library_id: session.library_id,
      title,
      artist: "",
      original_location: session.object_key,
      location_kind: "file",
    })
    .select("id, library_id")
    .single();
  if (trackError || !track) throw trackError ?? new Error("Could not register the uploaded track.");

  const { error: objectError } = await supabase.from("audio_objects").insert({
    track_id: track.id,
    kind: "original",
    bucket: getR2Config()?.bucket ?? "",
    object_key: session.object_key,
    content_type: session.content_type,
    byte_size: object.contentLength ?? session.size_bytes,
    sha256: null,
  });
  if (objectError) throw objectError;

  const { error: completeError } = await supabase
    .from("upload_sessions")
    .update({
      status: "completed",
      track_id: track.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", session.id);
  if (completeError) throw completeError;

  return {
    trackId: track.id,
    libraryId: track.library_id,
    objectKey: session.object_key,
  };
}
