import "server-only";

import { getR2Config, type R2Config } from "./env";
import { presignAwsRequest, r2ObjectUrl, signedAwsHeaders } from "./signature";

export const UPLOAD_TTL_SECONDS = 15 * 60;
export const PLAYBACK_TTL_SECONDS = 10 * 60;

function credentials(config: R2Config) {
  return {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3" as const,
  };
}

export function presignR2Put(input: {
  objectKey: string;
  contentType: string;
  expiresSeconds?: number;
  amzDate?: string;
}): { url: string; headers: Record<string, string>; expiresAt: string } | null {
  const config = getR2Config();
  if (!config) return null;
  const expiresSeconds = input.expiresSeconds ?? UPLOAD_TTL_SECONDS;
  const signed = presignAwsRequest(
    {
      method: "PUT",
      url: r2ObjectUrl(config.endpoint, config.bucket, input.objectKey),
      headers: { "Content-Type": input.contentType },
      expiresSeconds,
      amzDate: input.amzDate,
    },
    credentials(config),
  );
  return {
    url: signed.url,
    headers: { "Content-Type": input.contentType, ...signed.headers },
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
  };
}

export function presignR2Get(input: {
  objectKey: string;
  expiresSeconds?: number;
  amzDate?: string;
}): { url: string; expiresAt: string } | null {
  const config = getR2Config();
  if (!config) return null;
  const expiresSeconds = input.expiresSeconds ?? PLAYBACK_TTL_SECONDS;
  const signed = presignAwsRequest(
    {
      method: "GET",
      url: r2ObjectUrl(config.endpoint, config.bucket, input.objectKey),
      expiresSeconds,
      amzDate: input.amzDate,
    },
    credentials(config),
  );
  return {
    url: signed.url,
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
  };
}

export async function headR2Object(objectKey: string): Promise<{
  exists: boolean;
  contentLength?: number;
  etag?: string;
  contentType?: string;
}> {
  const config = getR2Config();
  if (!config) return { exists: false };
  const url = r2ObjectUrl(config.endpoint, config.bucket, objectKey);
  const headers = signedAwsHeaders({ method: "HEAD", url }, credentials(config));
  const response = await fetch(url, { method: "HEAD", headers, cache: "no-store" });
  if (response.status === 404) return { exists: false };
  if (!response.ok) {
    throw new Error(`R2 HEAD failed with status ${response.status}.`);
  }
  const lengthHeader = response.headers.get("content-length");
  return {
    exists: true,
    contentLength: lengthHeader ? Number(lengthHeader) : undefined,
    etag: response.headers.get("etag") ?? undefined,
    contentType: response.headers.get("content-type") ?? undefined,
  };
}
