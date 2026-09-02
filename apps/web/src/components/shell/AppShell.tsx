"use client";

import { useMemo } from "react";
import { StudioProvider } from "@/components/studio/StudioProvider";
import { StudioApp } from "@/components/studio/StudioApp";
import {
  createWebRuntime,
  resolveWebAppMode,
  type WebAppMode,
} from "@/lib/adapters/runtime";
import { getMockLibrary } from "@/lib/studio/mock-library";

export function AppShell({
  signedIn = true,
  mode: modeOverride,
}: {
  signedIn?: boolean;
  mode?: WebAppMode;
}) {
  const mode = modeOverride ?? resolveWebAppMode(process.env.NEXT_PUBLIC_APP_MODE);
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
        { id: "warm-up", name: "Warm-up", trackIds: [], intention: "Doors, 18:00–19:00", room: "Main", timeOfDay: "Early" },
        { id: "peak", name: "Peak", trackIds: [], intention: "Peak time, 22:30–00:00", room: "Main", timeOfDay: "Peak" },
        { id: "afters", name: "Afters", trackIds: [], intention: "Handover onward", room: "Second room", timeOfDay: "Late" },
        { id: "sunset-lounge", name: "Sunset lounge", trackIds: [], intention: "Rooftop, golden hour", room: "Lounge", timeOfDay: "Sunset" },
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
