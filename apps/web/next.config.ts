import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appRoot, "../..");

const appMode = process.env.NEXT_PUBLIC_APP_MODE;
if (
  appMode !== "mock" &&
  appMode !== "local" &&
  appMode !== "cloud" &&
  appMode !== "preview"
) {
  process.env.NEXT_PUBLIC_APP_MODE =
    process.env.VERCEL_ENV === "preview" ? "preview" : "mock";
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: [
    "@crate-dig/app-core",
    "@crate-dig/contracts",
    "deck.gl",
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/react",
    "@luma.gl/core",
    "@luma.gl/engine",
    "@luma.gl/shadertools",
    "@math.gl/core",
  ],
};

export default nextConfig;
