import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { IPC, type FileFilter, type SidecarSnapshot } from "../shared/native-api";
import type { OptionalCloudAuth } from "./auth";
import { isAllowedExternalUrl, isUuid } from "./loopback";
import type { SidecarSupervisor } from "./sidecar";

export type NativeHandlers = {
  sidecar: SidecarSupervisor;
  auth: OptionalCloudAuth;
  getWindow: () => BrowserWindow | null;
};

export function registerNativeIpc(handlers: NativeHandlers): void {
  ipcMain.handle(IPC.chooseFolder, async (event) => {
    assertSender(event, handlers);
    const window = handlers.getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC.chooseFile, async (event, filters?: unknown) => {
    assertSender(event, handlers);
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: sanitizeFilters(filters),
    });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC.sidecarStatus, (event) => {
    assertSender(event, handlers);
    return handlers.sidecar.getStatus();
  });

  ipcMain.handle(IPC.sidecarRestart, async (event) => {
    assertSender(event, handlers);
    return handlers.sidecar.restart();
  });

  ipcMain.handle(IPC.sidecarStop, async (event) => {
    assertSender(event, handlers);
    return handlers.sidecar.stop();
  });

  ipcMain.handle(IPC.workerLaunch, async (event, runId?: unknown) => {
    assertSender(event, handlers);
    const id = typeof runId === "string" && runId ? runId : undefined;
    if (id && !isUuid(id)) {
      return { status: "error", message: "runId must be a UUID when provided." };
    }
    return handlers.sidecar.launchWorker(id);
  });

  ipcMain.handle(IPC.workerStop, async (event) => {
    assertSender(event, handlers);
    return handlers.sidecar.stopWorker();
  });

  ipcMain.handle(IPC.workerStatus, (event) => {
    assertSender(event, handlers);
    return handlers.sidecar.workerState();
  });

  ipcMain.handle(IPC.openExternal, async (event, url?: unknown) => {
    assertSender(event, handlers);
    if (typeof url !== "string" || !isAllowedExternalUrl(url)) {
      throw new Error("External URL must be https: or mailto:.");
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC.cloudSyncState, (event) => {
    assertSender(event, handlers);
    return handlers.auth.getState();
  });

  ipcMain.handle(IPC.cloudSyncEnable, (event, enabled?: unknown) => {
    assertSender(event, handlers);
    return handlers.auth.setEnabled(Boolean(enabled));
  });

  ipcMain.handle(IPC.cloudSignIn, async (event) => {
    assertSender(event, handlers);
    const { state, authorizationUrl } = await handlers.auth.signIn();
    if (authorizationUrl && isAllowedExternalUrl(authorizationUrl)) {
      await shell.openExternal(authorizationUrl);
    }
    return state;
  });

  ipcMain.handle(IPC.cloudSignOut, (event) => {
    assertSender(event, handlers);
    return handlers.auth.signOut();
  });
}

export function broadcastSidecarStatus(snapshot: SidecarSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.sidecarEvent, snapshot);
  }
}

function assertSender(event: IpcMainInvokeEvent, handlers: NativeHandlers): void {
  const window = handlers.getWindow();
  if (window && event.sender !== window.webContents) {
    throw new Error("IPC sender is not the desktop renderer.");
  }
}

function sanitizeFilters(value: unknown): Electron.FileFilter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const name = "name" in item && typeof item.name === "string" ? item.name : "";
    const extensions =
      "extensions" in item && Array.isArray(item.extensions)
        ? item.extensions.filter((ext: unknown): ext is string => typeof ext === "string")
        : [];
    if (!name || extensions.length === 0) return [];
    return [{ name, extensions }];
  });
}

export type { FileFilter };
