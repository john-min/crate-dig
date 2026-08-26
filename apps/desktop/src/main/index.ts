import path from "node:path";
import started from "electron-squirrel-startup";
import { BrowserWindow, app, session, shell } from "electron";
import { OptionalCloudAuth } from "./auth";
import { attachLoopbackCorsBridge } from "./cors-bridge";
import { broadcastSidecarStatus, registerNativeIpc } from "./ipc";
import { isAllowedExternalUrl, isAllowedRendererNavigation } from "./loopback";
import { WINDOW_WEB_PREFERENCES } from "./security";
import { SidecarSupervisor } from "./sidecar";

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let sidecar: SidecarSupervisor | null = null;
let auth: OptionalCloudAuth | null = null;

function appRoot(): string {
  return path.resolve(__dirname, "../..");
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 880,
    minHeight: 640,
    title: "Crate Dig",
    show: false,
    webPreferences: {
      ...WINDOW_WEB_PREFERENCES,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const vite = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string"
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : undefined;
    if (!isAllowedRendererNavigation(url, vite)) {
      event.preventDefault();
    }
  });

  window.once("ready-to-show", () => window.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return window;
}

function attachSessionGuards(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  attachLoopbackCorsBridge(session.defaultSession, () => {
    const url = mainWindow?.webContents.getURL();
    if (!url) return null;
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const callback = argv.find((arg) => arg.startsWith("cratedig://"));
    if (callback) void auth?.completeFromCallback(callback);
    mainWindow?.show();
  });
}

app.on("ready", async () => {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient("cratedig", process.execPath, [path.resolve(process.argv[1] ?? "")]);
  } else {
    app.setAsDefaultProtocolClient("cratedig");
  }
  attachSessionGuards();
  auth = new OptionalCloudAuth(app.getPath("userData"));
  auth.load();
  sidecar = new SidecarSupervisor({
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
    appRoot: appRoot(),
    onChange: broadcastSidecarStatus,
  });
  registerNativeIpc({
    sidecar,
    auth,
    getWindow: () => mainWindow,
  });
  await sidecar.start();
  mainWindow = createWindow();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  void auth?.completeFromCallback(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on("before-quit", () => {
  void sidecar?.stop();
});
