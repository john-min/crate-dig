import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = process.argv[2];
if (!packagePath) throw new Error("usage: check_platform_neutral.mjs <package>");

const forbidden = [
  /from\s+["'](?:next(?:\/|["'])|server-only["'])/,
  /from\s+["']electron(?:\/|["'])/,
  /from\s+["']node:(?:fs|child_process|worker_threads|cluster)(?:\/|["'])/,
  /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/,
  /R2_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|API_TOKEN)/,
];

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(path)));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) result.push(path);
  }
  return result;
}

const source = resolve(root, packagePath, "src");
const failures = [];
for (const file of await sourceFiles(source)) {
  const contents = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(contents)) failures.push(`${relative(root, file)} matches ${pattern}`);
  }
}

if (failures.length) {
  throw new Error(`Platform boundary violation:\n${failures.join("\n")}`);
}
console.log(`${packagePath}: platform-neutral boundary passed`);
