import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  IPC_INVOKE_CHANNELS,
  isInvokeChannel,
  type CloudSyncState,
  type FileFilter,
  type NativeApi,
  type SidecarSnapshot,
  type WorkerState,
} from "../shared/native-api";

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!isInvokeChannel(channel)) {
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

const api: NativeApi = {
  chooseFolder: () => invoke<string | null>(IPC.chooseFolder),
  chooseFile: (filters) => invoke<string | null>(IPC.chooseFile, filters as FileFilter[] | undefined),
  getSidecarStatus: () => invoke<SidecarSnapshot>(IPC.sidecarStatus),
  restartSidecar: () => invoke<SidecarSnapshot>(IPC.sidecarRestart),
  stopSidecar: () => invoke<SidecarSnapshot>(IPC.sidecarStop),
  launchWorker: (runId) => invoke<WorkerState>(IPC.workerLaunch, runId),
  stopWorker: () => invoke<WorkerState>(IPC.workerStop),
  getWorkerStatus: () => invoke<WorkerState>(IPC.workerStatus),
  openExternal: (url) => invoke<void>(IPC.openExternal, url),
  getCloudSyncState: () => invoke<CloudSyncState>(IPC.cloudSyncState),
  setCloudSyncEnabled: (enabled) => invoke<CloudSyncState>(IPC.cloudSyncEnable, enabled),
  signInWithCloud: () => invoke<CloudSyncState>(IPC.cloudSignIn),
  signOutCloud: () => invoke<CloudSyncState>(IPC.cloudSignOut),
  onSidecarStatus: (listener) => {
    const wrapped = (_event: unknown, snapshot: SidecarSnapshot) => listener(snapshot);
    ipcRenderer.on(IPC.sidecarEvent, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC.sidecarEvent, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("crateDig", api);

void IPC_INVOKE_CHANNELS;
