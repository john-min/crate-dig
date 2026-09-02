import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(path));
    else if ([".ts", ".tsx", ".css", ".html"].includes(extname(path))) result.push(path);
  }
  return result;
}

describe("process boundary scan", () => {
  it("keeps secrets, Electron, and Next.js out of the renderer", () => {
    const forbidden = [
      /SUPABASE_SECRET_KEY/,
      /SERVICE_ROLE/,
      /R2_SECRET_ACCESS_KEY/,
      /from ["']electron["']/,
      /from ["']next(?:\/|["'])/,
      /from ["']@supabase\/ssr["']/,
      /from ["']@supabase\/supabase-js["']/,
      /nodeIntegration:\s*true/,
    ];
    for (const file of sourceFiles(join(root, "renderer"))) {
      const contents = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(contents, `${file} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps preload free of filesystem, child_process, and secrets", () => {
    const contents = readFileSync(join(root, "preload", "index.ts"), "utf8");
    expect(contents).toContain("contextBridge.exposeInMainWorld");
    expect(contents).not.toMatch(/SUPABASE_SECRET_KEY|node:fs|child_process|supabase-js/);
    expect(contents).toContain("isInvokeChannel");
  });

  it("emits Forge main/preload filenames instead of colliding index.js outputs", () => {
    const pkg = JSON.parse(readFileSync(join(root, "..", "package.json"), "utf8")) as {
      main: string;
    };
    expect(pkg.main).toBe(".vite/build/main.js");
    expect(readFileSync(join(root, "..", "vite.main.config.ts"), "utf8")).toContain('() => "main.js"');
    expect(readFileSync(join(root, "..", "vite.preload.config.ts"), "utf8")).toContain(
      'entryFileNames: "preload.js"',
    );
    expect(readFileSync(join(root, "main", "index.ts"), "utf8")).toContain(
      'preload: path.join(__dirname, "preload.js")',
    );
  });
});
