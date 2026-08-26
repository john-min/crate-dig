import type { CrateDigError } from "@crate-dig/contracts";

export function jsonError(error: CrateDigError, status: number): Response {
  return Response.json({ error }, { status });
}

export function notConfigured(operation: string): Response {
  return jsonError(
    {
      code: "CLOUD_NOT_CONFIGURED",
      message: `${operation} is unavailable because the cloud adapter is not configured.`,
      retryable: false,
      remediation:
        "Configure R2 and Supabase server credentials, then retry this authenticated cloud operation.",
    },
    503,
  );
}

export function unauthorized(): Response {
  return jsonError(
    {
      code: "CLOUD_UNAUTHORIZED",
      message: "Sign in to use the hosted library.",
      retryable: false,
      remediation: "Sign in with Google or email, then redeem a valid access code.",
    },
    401,
  );
}

export function forbidden(message = "An access code is required before using the hosted app."): Response {
  return jsonError(
    {
      code: "ACCESS_CODE_REQUIRED",
      message,
      retryable: false,
      remediation: "Enter a valid access code, then continue.",
    },
    403,
  );
}

export function badRequest(message: string, code = "CLOUD_BAD_REQUEST"): Response {
  return jsonError(
    {
      code,
      message,
      retryable: false,
    },
    400,
  );
}

export function notFound(message: string): Response {
  return jsonError(
    {
      code: "CLOUD_NOT_FOUND",
      message,
      retryable: false,
    },
    404,
  );
}

export function conflict(message: string): Response {
  return jsonError(
    {
      code: "CLOUD_CONFLICT",
      message,
      retryable: false,
    },
    409,
  );
}
