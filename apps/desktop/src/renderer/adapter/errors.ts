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
