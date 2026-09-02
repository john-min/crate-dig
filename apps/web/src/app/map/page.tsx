import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Map" };

/** Ungated demo: Supabase source=demo metadata, R2 playback via signed GETs. */
export default function MapDemoPage() {
  return <AppShell mode="preview" signedIn={false} />;
}
