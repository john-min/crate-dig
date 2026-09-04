import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { LOOPBACK_HOST, assertLoopbackHttpUrl, findFreeLoopbackPort, loopbackOrigin, parseSidecarMode } from "./loopback";
import { ensureCrateDigHome, resolveCrateDigHome, sidecarEnv, type HomePolicy } from "./home";
import { PACKAGING_GATES, type SidecarSnapshot, type WorkerState } from "../shared/native-api";

const MAX_LOG_LINES = 200;
const HEALTH_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 4_000;

export type SidecarHealth = {
  ok: boolean;
  host?: string;
  ffmpeg?: boolean;
  home?: string;
};

export type SidecarSupervisorOptions = {
  env?: NodeJS.ProcessEnv;
  isPackaged: boolean;
  userDataPath: string;
  appRoot: string;
  fetch?: typeof fetch;
  now?: () => number;
  onChange?: (snapshot: SidecarSnapshot) => void;
};

export class SidecarSupervisor {
  private readonly options: SidecarSupervisorOptions;
  private readonly requestFetch: typeof fetch;
  private apiChild: ChildProcess | null = null;
  private workerChild: ChildProcess | null = null;
  private workerRunId: string | undefined;
  private logs: string[] = [];
  private snapshot: SidecarSnapshot;
  private home: HomePolicy | null = null;

  constructor(options: SidecarSupervisorOptions) {
    this.options = options;
    this.requestFetch = options.fetch ?? fetch.bind(globalThis);
    this.snapshot = {
      status: "stopped",
      mode: parseSidecarMode(options.env?.CRATE_DIG_SIDECAR_MODE ?? process.env.CRATE_DIG_SIDECAR_MODE),
      owned: false,
      baseUrl: null,
      home: null,
      homeKind: null,
      port: null,
      worker: { status: "idle" },
      logs: [],
      packaging: PACKAGING_GATES,
    };
  }

  getStatus(): SidecarSnapshot {
    return { ...this.snapshot, logs: [...this.logs], worker: this.workerState() };
  }

  async start(): Promise<SidecarSnapshot> {
    const env = this.options.env ?? process.env;
    const mode = parseSidecarMode(env.CRATE_DIG_SIDECAR_MODE);
    this.home = ensureCrateDigHome(
      resolveCrateDigHome({
        env,
        isPackaged: this.options.isPackaged,
        userDataPath: this.options.userDataPath,
      }),
    );
    this.update({
      status: mode === "connect" ? "connecting" : "starting",
      mode,
      home: this.home.path,
      homeKind: this.home.kind,
      message: undefined,
    });

    if (mode === "connect" || mode === "auto") {
      const existing = await this.tryConnect(env);
      if (existing) return existing;
      if (mode === "connect") {
        this.update({
          status: "error",
          owned: false,
          message: "No healthy local API on loopback. Start apps/local-api or use supervise mode.",
          retryable: true,
        });
        return this.getStatus();
      }
    }

    if (this.options.isPackaged) {
      this.update({
        status: "error",
        owned: false,
        message:
          "Packaged Python sidecar bundling is a later gate. Use a development sidecar (apps/local-api) for now.",
        retryable: false,
      });
      return this.getStatus();
    }

    return this.spawnApi(env);
  }

  async restart(): Promise<SidecarSnapshot> {
    await this.stop({ stopExternal: false });
    return this.start();
  }

  async stop(options: { stopExternal?: boolean } = {}): Promise<SidecarSnapshot> {
    await this.stopWorker();
    if (this.apiChild) {
      await stopChild(this.apiChild);
      this.apiChild = null;
    } else if (options.stopExternal) {
      this.appendLog("Connected sidecar left running (not owned by this process).");
    }
    this.update({
      status: "stopped",
      owned: false,
      apiPid: undefined,
      message: undefined,
    });
    return this.getStatus();
  }

  async launchWorker(runId?: string): Promise<WorkerState> {
    if (this.workerChild && !this.workerChild.killed) {
      return {
        status: "error",
        message: "A local worker is already running. Stop it before launching another.",
      };
    }
    const env = this.options.env ?? process.env;
    const home = this.snapshot.home ?? this.home?.path;
    const port = this.snapshot.port;
    if (!home || !this.snapshot.baseUrl) {
      return { status: "error", message: "Sidecar is not healthy; cannot launch the worker." };
    }
    const command = resolveWorkerCommand(this.options);
    if (!command) {
      return {
        status: "error",
        message: this.options.isPackaged
          ? "Packaged worker bundling is a later gate."
          : "Could not find cratedig-local-worker. Install apps/local-api (.venv or uv).",
      };
    }
    const args = runId ? ["--run-id", runId] : [];
    const child = spawn(command.file, [...command.args, ...args], {
      cwd: command.cwd,
      env: sidecarEnv(home, LOOPBACK_HOST, port ?? 8000, env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.workerChild = child;
    this.workerRunId = runId;
    this.captureLogs("worker", child);
    child.once("exit", (code, signal) => {
      if (this.workerChild === child) {
        this.workerChild = null;
        this.appendLog(`worker exited code=${code} signal=${signal ?? ""}`);
        this.emit();
      }
    });
    this.emit();
    return this.workerState();
  }

  async stopWorker(): Promise<WorkerState> {
    if (this.workerChild) {
      await stopChild(this.workerChild);
      this.workerChild = null;
      this.workerRunId = undefined;
    }
    this.emit();
    return this.workerState();
  }

  workerState(): WorkerState {
    if (this.workerChild?.pid && !this.workerChild.killed) {
      return { status: "running", pid: this.workerChild.pid, runId: this.workerRunId };
    }
    return { status: "idle" };
  }

  private async tryConnect(env: NodeJS.ProcessEnv): Promise<SidecarSnapshot | null> {
    const configured = env.CRATE_DIG_SIDECAR_URL?.trim() || loopbackOrigin(8000);
    try {
      assertLoopbackHttpUrl(configured);
    } catch (error) {
      this.update({
        status: "error",
        message: error instanceof Error ? error.message : "Invalid sidecar URL.",
        retryable: false,
      });
      return this.getStatus();
    }
    const health = await this.checkHealth(configured, 1_500);
    if (!health?.ok) return null;
    const url = new URL(configured);
    this.update({
      status: "healthy",
      owned: false,
      baseUrl: configured.replace(/\/$/, ""),
      port: Number(url.port || "80"),
      home: health.home ?? this.home?.path ?? null,
      ffmpeg: health.ffmpeg,
      message: "Connected to an already-running local API.",
    });
    return this.getStatus();
  }

  private async spawnApi(env: NodeJS.ProcessEnv): Promise<SidecarSnapshot> {
    const command = resolveApiCommand(this.options);
    if (!command) {
      this.update({
        status: "error",
        owned: false,
        message:
          "Could not find cratedig-local-api. Create apps/local-api/.venv or install uv, then retry.",
        retryable: true,
      });
      return this.getStatus();
    }
    const preferred = Number(env.CRATE_DIG_API_PORT || "8000") || 8000;
    const port = await findFreeLoopbackPort(preferred);
    const home = this.home?.path;
    if (!home) {
      this.update({ status: "error", message: "CRATE_DIG_HOME was not resolved.", retryable: false });
      return this.getStatus();
    }
    const child = spawn(command.file, command.args, {
      cwd: command.cwd,
      env: sidecarEnv(home, LOOPBACK_HOST, port, env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.apiChild = child;
    this.captureLogs("api", child);
    child.once("exit", (code, signal) => {
      if (this.apiChild === child) {
        this.apiChild = null;
        this.update({
          status: "error",
          owned: false,
          apiPid: undefined,
          message: `Local API exited unexpectedly (code=${code}, signal=${signal ?? "none"}).`,
          retryable: true,
        });
      }
    });
    const baseUrl = loopbackOrigin(port);
    const health = await this.checkHealth(baseUrl, HEALTH_TIMEOUT_MS);
    if (!health?.ok) {
      await stopChild(child);
      this.apiChild = null;
      this.update({
        status: "error",
        owned: false,
        baseUrl,
        port,
        home,
        message: "Local API started but /health did not become ready.",
        retryable: true,
      });
      return this.getStatus();
    }
    this.update({
      status: "healthy",
      owned: true,
      baseUrl,
      port,
      home: health.home ?? home,
      ffmpeg: health.ffmpeg,
      apiPid: child.pid,
      message: "Supervised local API is healthy.",
    });
    return this.getStatus();
  }

  private async checkHealth(baseUrl: string, timeoutMs: number): Promise<SidecarHealth | null> {
    const deadline = (this.options.now ?? Date.now)() + timeoutMs;
    while ((this.options.now ?? Date.now)() <= deadline) {
      try {
        const response = await this.requestFetch(`${baseUrl.replace(/\/$/, "")}/health`, {
          cache: "no-store",
        });
        if (response.ok) {
          const body = (await response.json()) as SidecarHealth;
          if (body.ok) return body;
        }
      } catch {
        // keep polling
      }
      await sleep(250);
    }
    return null;
  }

  private captureLogs(label: string, child: ChildProcess): void {
    const onChunk = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) this.appendLog(`[${label} ${stream}] ${line.slice(0, 500)}`);
      }
    };
    child.stdout?.on("data", onChunk("stdout"));
    child.stderr?.on("data", onChunk("stderr"));
  }

  private appendLog(line: string): void {
    this.logs.push(line);
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs = this.logs.slice(-MAX_LOG_LINES);
    }
    this.emit();
  }

  private update(patch: Partial<SidecarSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      worker: this.workerState(),
      logs: [...this.logs],
      packaging: PACKAGING_GATES,
    };
    this.emit();
  }

  private emit(): void {
    this.options.onChange?.(this.getStatus());
  }
}

type Command = { file: string; args: string[]; cwd: string };

export function resolveLocalApiRoot(appRoot: string): string {
  return resolve(appRoot, "../local-api");
}

export function resolveApiCommand(options: Pick<SidecarSupervisorOptions, "appRoot" | "isPackaged">): Command | null {
  if (options.isPackaged) return null;
  const root = resolveLocalApiRoot(options.appRoot);
  const venv = join(root, ".venv", "bin", "cratedig-local-api");
  const venvWin = join(root, ".venv", "Scripts", "cratedig-local-api.exe");
  if (existsSync(venv)) return { file: venv, args: [], cwd: root };
  if (existsSync(venvWin)) return { file: venvWin, args: [], cwd: root };
  if (existsSync(join(root, "pyproject.toml"))) {
    return { file: "uv", args: ["run", "--project", root, "cratedig-local-api"], cwd: root };
  }
  return null;
}

export function resolveWorkerCommand(options: Pick<SidecarSupervisorOptions, "appRoot" | "isPackaged">): Command | null {
  if (options.isPackaged) return null;
  const root = resolveLocalApiRoot(options.appRoot);
  const venv = join(root, ".venv", "bin", "cratedig-local-worker");
  const venvWin = join(root, ".venv", "Scripts", "cratedig-local-worker.exe");
  if (existsSync(venv)) return { file: venv, args: [], cwd: root };
  if (existsSync(venvWin)) return { file: venvWin, args: [], cwd: root };
  if (existsSync(join(root, "pyproject.toml"))) {
    return { file: "uv", args: ["run", "--project", root, "cratedig-local-worker"], cwd: root };
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode != null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode == null) child.kill("SIGKILL");
    }, STOP_GRACE_MS);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
