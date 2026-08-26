import "server-only";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET_AUDIO?.trim() ?? "";
  const configuredEndpoint = process.env.R2_ENDPOINT?.trim() ?? "";
  const endpoint =
    configuredEndpoint ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: endpoint.replace(/\/$/, ""),
    region: process.env.R2_REGION?.trim() || "auto",
  };
}

export function requireR2Config(): R2Config {
  const config = getR2Config();
  if (!config) {
    throw new Error(
      "Missing R2 configuration. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_AUDIO, and R2_ENDPOINT or R2_ACCOUNT_ID.",
    );
  }
  return config;
}
