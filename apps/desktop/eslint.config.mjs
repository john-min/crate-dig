import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".vite/**", "out/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "electron", message: "Renderer cannot import Electron." },
            {
              name: "@supabase/supabase-js",
              message: "Supabase stays in the main process.",
            },
            {
              name: "@supabase/ssr",
              message: "Desktop does not use Next.js Supabase SSR.",
            },
          ],
          patterns: [
            { group: ["**/main/**"], message: "Renderer cannot import main-process modules." },
            { group: ["next", "next/*", "server-only"], message: "Desktop does not use Next.js." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/preload/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message: "Preload must not load Supabase or secrets.",
            },
            { name: "node:fs", message: "Preload has no filesystem access." },
            { name: "node:child_process", message: "Preload cannot spawn processes." },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
