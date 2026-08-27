import "server-only";

import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/cloud/access";
import { isCloudAppMode } from "@/lib/env";

export async function requireAppAccess() {
  if (!isCloudAppMode()) {
    return { user: null, profile: null };
  }

  const access = await getAppAccess();
  if (!access) redirect("/login");
  if (!access.profile.access_code_id) redirect("/access");
  return access;
}
