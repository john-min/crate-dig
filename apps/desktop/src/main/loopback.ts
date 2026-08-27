import net from "node:net";

export const LOOPBACK_HOST = "127.0.0.1";

export function parseSidecarMode(value: string | undefined): "auto" | "connect" | "supervise" {
  if (value === "connect" || value === "supervise" || value === "auto") return value;
  return "auto";
}

export function assertLoopbackHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:") {
    throw new Error("Sidecar URL must use http:// on loopback.");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Sidecar URL must bind to 127.0.0.1, never a public interface.");
  }
  return url;
}

export function loopbackOrigin(port: number): string {
  return `http://${LOOPBACK_HOST}:${port}`;
}

export function findFreeLoopbackPort(preferred = 8000): Promise<number> {
  return tryListen(preferred).catch(() => tryListen(0));
}

function tryListen(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      server.close();
      reject(error);
    });
    server.listen(port, LOOPBACK_HOST, () => {
      const address = server.address();
      const resolved =
        typeof address === "object" && address && typeof address.port === "number"
          ? address.port
          : port;
      server.close((closeError) => {
        if (closeError) reject(closeError);
        else resolve(resolved);
      });
    });
  });
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function isAllowedRendererNavigation(url: string, viteDevServerUrl?: string): boolean {
  if (viteDevServerUrl && url.startsWith(viteDevServerUrl)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:";
  } catch {
    return false;
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
