import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Map" };

/** Ungated high-fidelity discovery prototype with mock library data. */
export default function MapDemoPage() {
  return <AppShell signedIn={false} />;
}
