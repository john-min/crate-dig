import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Library" };

export default function AppPage() {
  return <AppShell />;
}
