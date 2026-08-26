import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureCrateDigHome, resolveCrateDigHome, sidecarEnv } from "../main/home";
import {
  assertLoopbackHttpUrl,
  isAllowedExternalUrl,
  isAllowedRendererNavigation,
  parseSidecarMode,
} from "../main/loopback";
import { WINDOW_WEB_PREFERENCES } from "../main/security";
import { SidecarSupervisor, resolveApiCommand, resolveLocalApiRoot } from "../main/sidecar";
import { presentSecretEnvKeys, readPublishableSupabaseConfig } from "../main/auth-config";
import { IPC, IPC_INVOKE_CHANNELS, isInvokeChannel } from "../shared/native-api";

describe("CRATE_DIG_HOME ownership", () => {
  it("prefers an explicit home, then isolated temp, then packaged userData, then ~/.crate-dig", () => {
    expect(
      resolveCrateDigHome({
        env: { CRATE_DIG_HOME: "/tmp/explicit-home" },
        isPackaged: true,
        userDataPath: "/Users/lj/Library/Application Support/Crate Dig",
      }).kind,
    ).toBe("explicit");
    expect(
      resolveCrateDigHome({
        env: { CRATE_DIG_ISOLATED_HOME: "1" },
        isPackaged: false,
        userDataPath: "/tmp/user-data",
        tmpdir: "/tmp",
        pid: 42,
      }),
    ).toEqual({ kind: "isolated", path: "/tmp/crate-dig-desktop-42" });
    expect(
      resolveCrateDigHome({
        env: {},
        isPackaged: true,
        userDataPath: "/Users/lj/Library/Application Support/Crate Dig",
      }),
    ).toEqual({
      kind: "user-data",
      path: "/Users/lj/Library/Application Support/Crate Dig/crate-dig-home",
    });
    expect(
      resolveCrateDigHome({
        env: {},
        isPackaged: false,
        userDataPath: "/tmp/user-data",
        homedir: "/Users/lj",
      }),
    ).toEqual({ kind: "dev-default", path: "/Users/lj/.crate-dig" });
  });

  it("creates the home directory but never a sqlite file", () => {
    const dir = mkdtempSync(join(tmpdir(), "crate-dig-home-"));
    const policy = ensureCrateDigHome({ kind: "isolated", path: join(dir, "nested") });
    expect(policy.path.endsWith("nested")).toBe(true);
    const env = sidecarEnv(policy.path, "127.0.0.1", 8765, { PATH: "/usr/bin" });
    expect(env.CRATE_DIG_HOME).toBe(policy.path);
    expect(env.CRATE_DIG_API_HOST).toBe("127.0.0.1");
    expect(env.CRATE_DIG_API_PORT).toBe("8765");
  });
});

describe("loopback and window security", () => {
  it("rejects non-loopback sidecar URLs and non-https external links", () => {
    expect(() => assertLoopbackHttpUrl("http://0.0.0.0:8000")).toThrow(/127\.0\.0\.1/);
    expect(() => assertLoopbackHttpUrl("https://example.com")).toThrow(/http/);
    expect(assertLoopbackHttpUrl("http://127.0.0.1:8000").hostname).toBe("127.0.0.1");
    expect(isAllowedExternalUrl("https://accounts.google.com")).toBe(true);
    expect(isAllowedExternalUrl("http://127.0.0.1:8000")).toBe(false);
    expect(isAllowedRendererNavigation("file:///tmp/index.html")).toBe(true);
    expect(isAllowedRendererNavigation("https://evil.example")).toBe(false);
  });

  it("locks the renderer behind contextIsolation without Node integration", () => {
    expect(WINDOW_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });

  it("parses sidecar modes with auto as the default", () => {
    expect(parseSidecarMode("supervise")).toBe("supervise");
    expect(parseSidecarMode(undefined)).toBe("auto");
  });
});

describe("optional cloud auth config", () => {
  it("reads only the publishable pair and never requires a secret key", () => {
    const env = {
      CRATE_DIG_SUPABASE_URL: "https://example.supabase.co",
      CRATE_DIG_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "super-secret",
      SUPABASE_SERVICE_ROLE_KEY: "role-secret",
    };
    expect(readPublishableSupabaseConfig(env)).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
    expect(presentSecretEnvKeys(env).sort()).toEqual([
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    expect(readPublishableSupabaseConfig({ SUPABASE_SECRET_KEY: "nope" })).toBeNull();
  });
});

describe("preload IPC allowlist", () => {
  it("exposes only named native channels", () => {
    expect(IPC_INVOKE_CHANNELS).toContain(IPC.chooseFolder);
    expect(IPC_INVOKE_CHANNELS).not.toContain("electron");
    expect(isInvokeChannel("crate-dig:choose-folder")).toBe(true);
    expect(isInvokeChannel("fs:read")).toBe(false);
  });
});

describe("sidecar supervision", () => {
  it("resolves the development local-api package next to apps/desktop", () => {
    expect(resolveLocalApiRoot("/repo/apps/desktop")).toBe("/repo/apps/local-api");
    expect(resolveApiCommand({ appRoot: "/repo/apps/desktop", isPackaged: true })).toBeNull();
  });

  it("connects to a healthy loopback API without spawning a duplicate", async () => {
    const home = mkdtempSync(join(tmpdir(), "crate-dig-connect-"));
    const supervisor = new SidecarSupervisor({
      env: {
        CRATE_DIG_SIDECAR_MODE: "connect",
        CRATE_DIG_HOME: home,
        CRATE_DIG_SIDECAR_URL: "http://127.0.0.1:8000",
      },
      isPackaged: false,
      userDataPath: home,
      appRoot: "/repo/apps/desktop",
      fetch: async () =>
        new Response(
          JSON.stringify({ ok: true, host: "127.0.0.1", ffmpeg: false, home }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    const status = await supervisor.start();
    expect(status.status).toBe("healthy");
    expect(status.owned).toBe(false);
    expect(status.baseUrl).toBe("http://127.0.0.1:8000");
    expect(status.packaging.pythonSidecarBundled).toBe(false);
  });

  it("refuses packaged sidecar launch until the later bundling gate", async () => {
    const home = mkdtempSync(join(tmpdir(), "crate-dig-packaged-"));
    const supervisor = new SidecarSupervisor({
      env: { CRATE_DIG_SIDECAR_MODE: "supervise", CRATE_DIG_HOME: home },
      isPackaged: true,
      userDataPath: home,
      appRoot: "/repo/apps/desktop",
      fetch: async () => {
        throw new Error("network should not be required");
      },
    });
    const status = await supervisor.start();
    expect(status.status).toBe("error");
    expect(status.message).toMatch(/later gate/i);
  });

  it("does not silently launch a second worker", async () => {
    const parent = mkdtempSync(join(tmpdir(), "crate-dig-layout-"));
    const apiRoot = join(parent, "local-api");
    const desktopRoot = join(parent, "desktop");
    mkdirSync(join(apiRoot, ".venv", "bin"), { recursive: true });
    mkdirSync(desktopRoot, { recursive: true });
    writeFileSync(join(apiRoot, ".venv", "bin", "cratedig-local-worker"), "#!/bin/sh\nexec sleep 30\n", {
      mode: 0o755,
    });
    const home = mkdtempSync(join(tmpdir(), "crate-dig-worker-"));
    const supervisor = new SidecarSupervisor({
      env: {
        CRATE_DIG_SIDECAR_MODE: "connect",
        CRATE_DIG_HOME: home,
        CRATE_DIG_SIDECAR_URL: "http://127.0.0.1:8000",
      },
      isPackaged: false,
      userDataPath: home,
      appRoot: desktopRoot,
      fetch: async () =>
        new Response(JSON.stringify({ ok: true, host: "127.0.0.1", ffmpeg: false, home }), {
          status: 200,
        }),
    });
    await supervisor.start();
    const first = await supervisor.launchWorker();
    expect(first.status).toBe("running");
    const second = await supervisor.launchWorker();
    expect(second).toMatchObject({ status: "error" });
    await supervisor.stopWorker();
  });
});
