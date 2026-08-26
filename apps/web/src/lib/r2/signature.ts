import { createHash, createHmac } from "node:crypto";

const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const ALGORITHM = "AWS4-HMAC-SHA256";

export interface SignableRequest {
  method: string;
  url: URL;
  headers?: Readonly<Record<string, string>>;
  amzDate?: string;
  expiresSeconds?: number;
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function encodeS3Path(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      try {
        return encodeRfc3986(decodeURIComponent(segment));
      } catch {
        return encodeRfc3986(segment);
      }
    })
    .join("/");
}

function normalizeHeaders(
  headers: Readonly<Record<string, string>> | undefined,
  host: string,
): { canonical: string; signedNames: string; values: Record<string, string> } {
  const merged: Record<string, string> = { host };
  for (const [name, value] of Object.entries(headers ?? {})) {
    merged[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
  }
  const names = Object.keys(merged).sort();
  const canonical = names.map((name) => `${name}:${merged[name]}\n`).join("");
  return { canonical, signedNames: names.join(";"), values: merged };
}

function canonicalQuery(params: URLSearchParams): string {
  const encoded = [...params.entries()].map(([key, value]) => [
    encodeRfc3986(key),
    encodeRfc3986(value),
  ]);
  encoded.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return encoded.map(([key, value]) => `${key}=${value}`).join("&");
}

function credentialScope(dateStamp: string, region: string, service: string): string {
  return `${dateStamp}/${region}/${service}/aws4_request`;
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, "aws4_request");
}

function amzDateParts(amzDate?: string): { amzDate: string; dateStamp: string } {
  const value = amzDate ?? new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return { amzDate: value, dateStamp: value.slice(0, 8) };
}

export function presignAwsRequest(
  request: SignableRequest,
  credentials: AwsCredentials,
): { url: string; headers: Record<string, string> } {
  const service = credentials.service ?? "s3";
  const expiresSeconds = request.expiresSeconds ?? 900;
  const { amzDate, dateStamp } = amzDateParts(request.amzDate);
  const scope = credentialScope(dateStamp, credentials.region, service);
  const url = new URL(request.url);
  const headerSet = normalizeHeaders(request.headers, url.host);

  const query = new URLSearchParams(url.search);
  query.set("X-Amz-Algorithm", ALGORITHM);
  query.set("X-Amz-Credential", `${credentials.accessKeyId}/${scope}`);
  query.set("X-Amz-Date", amzDate);
  query.set("X-Amz-Expires", String(expiresSeconds));
  query.set("X-Amz-SignedHeaders", headerSet.signedNames);

  const canonicalRequest = [
    request.method.toUpperCase(),
    encodeS3Path(url.pathname) || "/",
    canonicalQuery(query),
    headerSet.canonical,
    headerSet.signedNames,
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, dateStamp, credentials.region, service),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  query.set("X-Amz-Signature", signature);
  url.search = query.toString();

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers[name] = value;
  }
  return { url: url.toString(), headers };
}

export function signedAwsHeaders(
  request: Omit<SignableRequest, "expiresSeconds">,
  credentials: AwsCredentials,
): Record<string, string> {
  const service = credentials.service ?? "s3";
  const { amzDate, dateStamp } = amzDateParts(request.amzDate);
  const scope = credentialScope(dateStamp, credentials.region, service);
  const url = new URL(request.url);
  const extra = {
    host: url.host,
    "x-amz-content-sha256": UNSIGNED_PAYLOAD,
    "x-amz-date": amzDate,
    ...(request.headers ?? {}),
  };
  const headerSet = normalizeHeaders(extra, url.host);
  const canonicalRequest = [
    request.method.toUpperCase(),
    encodeS3Path(url.pathname) || "/",
    canonicalQuery(new URLSearchParams(url.search)),
    headerSet.canonical,
    headerSet.signedNames,
    UNSIGNED_PAYLOAD,
  ].join("\n");
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, dateStamp, credentials.region, service),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    Authorization: `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${headerSet.signedNames}, Signature=${signature}`,
    "x-amz-content-sha256": UNSIGNED_PAYLOAD,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(request.headers ?? {}).filter(
        ([name]) => name.toLowerCase() !== "host",
      ),
    ),
  };
}

export function r2ObjectUrl(endpoint: string, bucket: string, objectKey: string): URL {
  const url = new URL(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  const segments = [bucket, ...objectKey.split("/").filter(Boolean)];
  url.pathname = `/${segments.join("/")}`;
  url.search = "";
  url.hash = "";
  return url;
}
