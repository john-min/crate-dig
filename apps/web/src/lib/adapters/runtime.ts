import type {
  CloudRuntimeComposition,
  LocalRuntimeComposition,
  MockRuntimeComposition,
} from "@crate-dig/contracts";
import { CloudAdapter } from "./cloud-adapter";
import { LocalAdapter } from "./local-adapter";
import { MockAdapter } from "./mock-adapter";

export type WebAppMode = "mock" | "local" | "cloud" | "preview";
export type WebRuntimeComposition =
  | MockRuntimeComposition
  | LocalRuntimeComposition
  | CloudRuntimeComposition;

export function resolveWebAppMode(value: string | undefined): WebAppMode {
  if (value === "mock" || value === "local" || value === "cloud" || value === "preview") {
    return value;
  }
  throw new Error(
    "NEXT_PUBLIC_APP_MODE must be explicitly configured as mock, local, cloud, or preview.",
  );
}

export function createWebRuntime(
  mode: WebAppMode,
  environment: {
    localApiUrl?: string;
    cloudApiUrl?: string;
  } = {},
): WebRuntimeComposition {
  switch (mode) {
    case "mock":
      return { adapter: new MockAdapter() };
    case "preview":
      return {
        adapter: new MockAdapter({
          playbackPath: "/api/preview/playback",
          catalogPath: "/api/preview/catalog",
          neighborsPath: "/api/preview/tracks",
        }),
      };
    case "local":
      return {
        adapter: new LocalAdapter({
          baseUrl: environment.localApiUrl,
        }),
      };
    case "cloud":
      return {
        adapter: new CloudAdapter({
          baseUrl: environment.cloudApiUrl,
        }),
      };
  }
}
