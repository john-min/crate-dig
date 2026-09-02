import type { Session } from "electron";
import { FASTAPI_CORS_PLACEHOLDER_ORIGIN } from "./security";

type HeaderMap = Record<string, string | string[] | undefined>;
type ResponseHeaders = Record<string, string[]>;

/**
 * apps/local-api currently allowlists only localhost:3000. Desktop cannot edit
 * that process. Main rewrites loopback CORS so the Vite/file renderer can call
 * 127.0.0.1 over HTTP without opening the API to non-loopback origins.
 */
export function rewriteLoopbackCorsHeaders(
  responseHeaders: HeaderMap | undefined,
  rendererOrigin: string | null,
): ResponseHeaders {
  const allowOrigin =
    rendererOrigin && rendererOrigin !== "null" && !rendererOrigin.startsWith("file:")
      ? rendererOrigin
      : "*";
  const headers: ResponseHeaders = {};
  for (const [key, value] of Object.entries(responseHeaders ?? {})) {
    if (key.toLowerCase().startsWith("access-control-")) continue;
    if (value == null) continue;
    headers[key] = Array.isArray(value) ? value : [String(value)];
  }
  headers["Access-Control-Allow-Origin"] = [allowOrigin];
  headers["Access-Control-Allow-Headers"] = ["Range, Content-Type"];
  headers["Access-Control-Allow-Methods"] = ["GET, POST, OPTIONS"];
  headers["Access-Control-Expose-Headers"] = ["Content-Range, Accept-Ranges, Content-Length"];
  return headers;
}

export function attachLoopbackCorsBridge(
  session: Session,
  getRendererOrigin: () => string | null,
): void {
  const filter = { urls: ["http://127.0.0.1:*/*", "http://localhost:*/*"] };

  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = { ...details.requestHeaders };
    if (isLoopbackUrl(details.url)) {
      headers.Origin = FASTAPI_CORS_PLACEHOLDER_ORIGIN;
    }
    callback({ requestHeaders: headers });
  });

  session.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (!isLoopbackUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: rewriteLoopbackCorsHeaders(details.responseHeaders, getRendererOrigin()),
    });
  });
}

function isLoopbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}
