export type AccessCodeRpcResult =
  | { ok: true; id?: string; code?: string; already?: boolean }
  | { ok: false; error: string };

export function parseAccessCodeRpc(data: unknown, fallback: string): AccessCodeRpcResult {
  if (!data || typeof data !== "object") return { ok: false, error: fallback };
  const record = data as Record<string, unknown>;
  if (record.ok === true) {
    return {
      ok: true,
      id: typeof record.id === "string" ? record.id : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      already: record.already === true,
    };
  }
  if (record.ok === false && typeof record.error === "string") {
    return { ok: false, error: record.error };
  }
  return { ok: false, error: fallback };
}
