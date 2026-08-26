import { mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type HomeKind = "isolated" | "user-data" | "explicit" | "dev-default";

export type HomePolicy = {
  kind: HomeKind;
  path: string;
};

export type HomeResolutionInput = {
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  userDataPath: string;
  homedir?: string;
  tmpdir?: string;
  pid?: number;
};

/**
 * Electron main owns CRATE_DIG_HOME and passes it to the sidecar.
 * SQLite (`crate-dig.sqlite`) and preview artifacts stay inside that directory
 * and are opened only by FastAPI/worker — never by the renderer.
 * Original audio files remain at their import paths, outside SQLite.
 */
export function resolveCrateDigHome(input: HomeResolutionInput): HomePolicy {
  const explicit = input.env.CRATE_DIG_HOME?.trim();
  if (explicit) {
    return { kind: "explicit", path: resolve(explicit) };
  }

  const isolated = truthy(input.env.CRATE_DIG_ISOLATED_HOME);
  if (isolated) {
    const pid = input.pid ?? process.pid;
    return {
      kind: "isolated",
      path: join(input.tmpdir ?? tmpdir(), `crate-dig-desktop-${pid}`),
    };
  }

  if (input.isPackaged) {
    return { kind: "user-data", path: join(input.userDataPath, "crate-dig-home") };
  }

  return {
    kind: "dev-default",
    path: join(input.homedir ?? homedir(), ".crate-dig"),
  };
}

export function ensureCrateDigHome(policy: HomePolicy): HomePolicy {
  mkdirSync(policy.path, { recursive: true });
  return policy;
}

export function sidecarEnv(
  home: string,
  host: string,
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    CRATE_DIG_HOME: home,
    CRATE_DIG_API_HOST: host,
    CRATE_DIG_API_PORT: String(port),
  };
}

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}
