import type { DesktopRuntimeComposition } from "@crate-dig/contracts";
import type { AuthSession } from "@crate-dig/contracts";
import { DesktopAdapter } from "./desktop-adapter";

export function createDesktopRuntime(options: {
  localApiUrl: string;
  getAuthSession?: () => Promise<AuthSession | null>;
}): DesktopRuntimeComposition {
  const adapter = new DesktopAdapter({
    baseUrl: options.localApiUrl,
    getAuthSession: options.getAuthSession,
  });
  return {
    adapter,
    projection: {
      getProjectionMapFeed: () => adapter.getProjectionMapFeed(),
    },
  };
}
