import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@crate-dig/app-core": resolve(repoRoot, "packages/app-core/src/index.ts"),
      "@crate-dig/contracts": resolve(repoRoot, "packages/contracts/src/index.ts"),
      "@crate-dig/ui": resolve(repoRoot, "packages/ui/src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
