import type { ReactNode } from "react";
import { requireAppAccess } from "@/lib/auth/gates";

export default async function StudioLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAppAccess();
  return children;
}
