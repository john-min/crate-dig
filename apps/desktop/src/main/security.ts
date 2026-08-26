export const WINDOW_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const;

export const FASTAPI_CORS_PLACEHOLDER_ORIGIN = "http://127.0.0.1:3000";
