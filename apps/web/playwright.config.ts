import { defineConfig, devices } from "@playwright/test";

const localSmoke = process.env.CRATE_DIG_LOCAL_SMOKE === "1";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
  webServer: {
    command: localSmoke
      ? "NEXT_PUBLIC_APP_MODE=local NEXT_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8000 pnpm dev --hostname 127.0.0.1 --port 3000"
      : "NEXT_PUBLIC_APP_MODE=mock NEXT_PUBLIC_LOCAL_API_URL=http://127.0.0.1:65535 pnpm dev --hostname 127.0.0.1 --port 3000",
    url: localSmoke ? "http://localhost:3000/map" : "http://localhost:3000/map?source=mock",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
