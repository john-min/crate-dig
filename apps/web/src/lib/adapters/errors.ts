import type { CrateDigError } from "@crate-dig/contracts";

export class AdapterError extends Error implements CrateDigError {
  readonly code: string;
  readonly retryable: boolean;
  readonly remediation?: string;

  constructor(error: CrateDigError, options?: ErrorOptions) {
    super(error.message, options);
    this.name = "AdapterError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.remediation = error.remediation;
  }
}

export function unavailable(operation: string, runtime: "cloud" | "local" = "cloud"): AdapterError {
  return new AdapterError({
    code: `${runtime.toUpperCase()}_NOT_CONFIGURED`,
    message: `${operation} is unavailable because the ${runtime} adapter is not configured.`,
    retryable: false,
    remediation:
      runtime === "cloud"
        ? "Configure NEXT_PUBLIC_CLOUD_API_URL and implement the cloud control-plane operation."
        : "Start the local API and verify NEXT_PUBLIC_LOCAL_API_URL.",
  });
}

export function normalizeAdapterError(
  value: unknown,
  fallbackCode = "ADAPTER_REQUEST_FAILED",
): AdapterError {
  if (value instanceof AdapterError) return value;
  if (value instanceof Error) {
    return new AdapterError(
      {
        code: fallbackCode,
        message: value.message,
        retryable: value.name !== "TypeError",
      },
      { cause: value },
    );
  }
  return new AdapterError({
    code: fallbackCode,
    message: "The adapter request failed.",
    retryable: false,
  });
}
