import type { QRequest, QResponse } from "./types";

export class QRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QRequestError";
  }
}

export async function requestQ(input: QRequest): Promise<QResponse> {
  const response = await fetch("/api/q", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new QRequestError(body?.error || "Q could not answer that.", response.status);
  }

  return (await response.json()) as QResponse;
}
