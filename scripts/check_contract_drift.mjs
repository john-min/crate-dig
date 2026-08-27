import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = [
  "contracts/openapi/local-api.json",
  "packages/contracts/src/generated/local-api.ts",
];

const before = new Map();
for (const artifact of artifacts) {
  before.set(artifact, await readFile(resolve(root, artifact), "utf8"));
}

const generation = spawnSync("pnpm", ["contracts:generate"], {
  cwd: root,
  stdio: "inherit",
});
if (generation.status !== 0) {
  process.exit(generation.status ?? 1);
}

const changed = [];
for (const artifact of artifacts) {
  const after = await readFile(resolve(root, artifact), "utf8");
  if (before.get(artifact) !== after) changed.push(artifact);
}

if (changed.length) {
  console.error(`Generated contract drift detected:\n${changed.join("\n")}`);
  process.exit(1);
}

console.log("Generated OpenAPI and TypeScript contracts are current");
