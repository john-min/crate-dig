"use client";

import { useMemo } from "react";
import { StudioProvider } from "@/components/studio/StudioProvider";
import { StudioApp } from "@/components/studio/StudioApp";
import {
  createWebRuntime,
  resolveWebAppMode,
} from "@/lib/adapters/runtime";
import { getMockLibrary } from "@/lib/studio/mock-library";

export function AppShell({ signedIn = true }: { signedIn?: boolean }) {
  const mode = resolveWebAppMode(process.env.NEXT_PUBLIC_APP_MODE);
  const sessionOnly = mode === "preview" || mode === "mock";
  const runtime = useMemo(
    () =>
      createWebRuntime(mode, {
        localApiUrl: process.env.NEXT_PUBLIC_LOCAL_API_URL,
        cloudApiUrl: process.env.NEXT_PUBLIC_CLOUD_API_URL,
      }),
    [mode],
  );
  const initialCrates = useMemo(() => {
    if (mode === "preview") {
      return [
        {
          id: "session",
          name: "Session crate",
          trackIds: [],
          intention: "Lasts until you close this tab",
          room: "Preview",
          timeOfDay: "Now",
        },
      ];
    }
    if (mode === "mock") return getMockLibrary().crates;
    if (mode === "local") {
      return [
        {
          id: "local",
          name: "Local crate",
          trackIds: [],
          intention: "Playing files from this machine",
          room: "Local",
          timeOfDay: "Now",
        },
      ];
    }
    return [];
  }, [mode]);

  return (
    <StudioProvider
      adapter={runtime.adapter}
      initialCrates={initialCrates}
      librarySource={mode === "local" ? "disk" : mode === "cloud" ? "cloud" : mode === "preview" ? "preview" : "mock"}
      projection={runtime.projection}
      sessionOnly={sessionOnly}
    >
      <StudioApp signedIn={mode === "cloud" ? signedIn : false} />
    </StudioProvider>
  );
}
