import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

/**
 * Packaging stages from docs/DESKTOP_APP_SPEC.md:
 * 1. Development Forge/Vite shell (this scaffold) using an external or supervised API/worker.
 * 2. Supervised development sidecars with isolated CRATE_DIG_HOME (supported in main).
 * 3. Packaged Python API/worker + embedded models — later gate (see extraResource stub).
 * 4. Signed/notarized distribution — later gate (osxSign/osxNotarize omitted).
 * 5. Auto-update / model-download channels — later gate (no publisher configured).
 */
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Crate Dig",
    appBundleId: "fm.cratedig.desktop",
    // extraResource: ["../local-api/dist/cratedig-local-api"] — binary sidecar bundling is a later gate.
    // osxSign / osxNotarize — signing and notarization are a later gate.
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerSquirrel({}),
    new MakerDeb({}),
    new MakerRpm({}),
  ],
  // publishers: [] — auto-update is a later gate after rollback/checksum policy.
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/index.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
