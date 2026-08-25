"use client";

import { StudioProvider } from "@/components/studio/StudioProvider";
import { StudioApp } from "@/components/studio/StudioApp";

export function AppShell({ signedIn = true }: { signedIn?: boolean }) {
  return (
    <StudioProvider>
      <StudioApp signedIn={signedIn} />
    </StudioProvider>
  );
}
