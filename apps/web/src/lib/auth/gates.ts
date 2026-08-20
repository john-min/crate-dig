import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  clearAccessCodeCookie,
  readAccessCodeCookie,
  redeemAccessCodeForUser,
} from "@/lib/auth/access-code";

export async function requireAppAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, access_code_id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_code_id) {
    return { user, profile };
  }

  const pendingCode = await readAccessCodeCookie();
  if (pendingCode) {
    const redeemed = await redeemAccessCodeForUser(user.id, pendingCode);
    if (redeemed.ok) {
      await clearAccessCodeCookie();
      return {
        user,
        profile: {
          id: user.id,
          access_code_id: "redeemed",
          display_name: profile?.display_name ?? null,
        },
      };
    }
  }

  redirect("/access");
}
