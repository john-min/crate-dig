import type { AuthSession } from "@crate-dig/contracts";

export const IPC = {
  chooseFolder: "crate-dig:choose-folder",
  chooseFile: "crate-dig:choose-file",
  sidecarStatus: "crate-dig:sidecar-status",
  sidecarRestart: "crate-dig:sidecar-restart",
  sidecarStop: "crate-dig:sidecar-stop",
  workerLaunch: "crate-dig:worker-launch",
  workerStop: "crate-dig:worker-stop",
  workerStatus: "crate-dig:worker-status",
  openExternal: "crate-dig:open-external",
  cloudSyncState: "crate-dig:cloud-sync-state",
  cloudSyncEnable: "crate-dig:cloud-sync-enable",
  cloudSignIn: "crate-dig:cloud-sign-in",
  cloudSignOut: "crate-dig:cloud-sign-out",
  sidecarEvent: "crate-dig:sidecar-event",
} as const;

export type IpcInvokeChannel =
  | typeof IPC.chooseFolder
  | typeof IPC.chooseFile
  | typeof IPC.sidecarStatus
  | typeof IPC.sidecarRestart
  | typeof IPC.sidecarStop
  | typeof IPC.workerLaunch
  | typeof IPC.workerStop
  | typeof IPC.workerStatus
  | typeof IPC.openExternal
  | typeof IPC.cloudSyncState
  | typeof IPC.cloudSyncEnable
  | typeof IPC.cloudSignIn
  | typeof IPC.cloudSignOut;

export const IPC_INVOKE_CHANNELS: readonly IpcInvokeChannel[] = [
  IPC.chooseFolder,
  IPC.chooseFile,
  IPC.sidecarStatus,
  IPC.sidecarRestart,
  IPC.sidecarStop,
  IPC.workerLaunch,
  IPC.workerStop,
  IPC.workerStatus,
  IPC.openExternal,
  IPC.cloudSyncState,
  IPC.cloudSyncEnable,
  IPC.cloudSignIn,
  IPC.cloudSignOut,
];

export type SidecarMode = "auto" | "connect" | "supervise";

export type WorkerState =
  | { status: "idle" }
  | { status: "running"; pid: number; runId?: string }
  | { status: "exited"; code: number | null; signal: string | null }
  | { status: "error"; message: string };

export type PackagingGates = {
  pythonSidecarBundled: false;
  notarization: false;
  autoUpdate: false;
};

export const PACKAGING_GATES: PackagingGates = {
  pythonSidecarBundled: false,
  notarization: false,
  autoUpdate: false,
};

export type SidecarSnapshot = {
  status: "starting" | "connecting" | "healthy" | "stopped" | "error";
  mode: SidecarMode;
  owned: boolean;
  baseUrl: string | null;
  home: string | null;
  homeKind: "isolated" | "user-data" | "explicit" | "dev-default" | null;
  port: number | null;
  ffmpeg?: boolean;
  apiPid?: number;
  worker: WorkerState;
  logs: readonly string[];
  message?: string;
  retryable?: boolean;
  packaging: PackagingGates;
};

export type CloudSyncState = {
  enabled: boolean;
  session: AuthSession | null;
  configured: boolean;
  message?: string;
};

export type NativeApi = {
  chooseFolder(): Promise<string | null>;
  chooseFile(filters?: readonly FileFilter[]): Promise<string | null>;
  getSidecarStatus(): Promise<SidecarSnapshot>;
  restartSidecar(): Promise<SidecarSnapshot>;
  stopSidecar(): Promise<SidecarSnapshot>;
  launchWorker(runId?: string): Promise<WorkerState>;
  stopWorker(): Promise<WorkerState>;
  getWorkerStatus(): Promise<WorkerState>;
  openExternal(url: string): Promise<void>;
  getCloudSyncState(): Promise<CloudSyncState>;
  setCloudSyncEnabled(enabled: boolean): Promise<CloudSyncState>;
  signInWithCloud(): Promise<CloudSyncState>;
  signOutCloud(): Promise<CloudSyncState>;
  onSidecarStatus(listener: (status: SidecarSnapshot) => void): () => void;
};

export type FileFilter = {
  name: string;
  extensions: readonly string[];
};

export function isInvokeChannel(channel: string): channel is IpcInvokeChannel {
  return (IPC_INVOKE_CHANNELS as readonly string[]).includes(channel);
}
