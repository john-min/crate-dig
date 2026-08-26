import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  clearAccessCodeCookie,
  readAccessCodeCookie,
  redeemAccessCodeForUser,
} from "@/lib/auth/access-code";
import { forbidden, notConfigured, unauthorized } from "@/lib/cloud/http";
import { getSupabasePublishableEnv, isCloudAppMode } from "@/lib/env";

export type AppAccess = {
  user: User;
  profile: {
    id: string;
    access_code_id: string | null;
    display_name: string | null;
  };
};

export async function getAppAccess(): Promise<AppAccess | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
      const { data: refreshed } = await supabase
        .from("profiles")
        .select("id, access_code_id, display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (refreshed?.access_code_id) {
        return { user, profile: refreshed };
      }
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

  return { user, profile: profile ?? { id: user.id, access_code_id: null, display_name: null } };
}

export async function requireApiAccess(): Promise<
  { ok: true; access: AppAccess } | { ok: false; response: Response }
> {
  if (!isCloudAppMode()) {
    return {
      ok: false,
      response: notConfigured("Hosted cloud APIs"),
    };
  }
  if (!getSupabasePublishableEnv()) {
    return {
      ok: false,
      response: notConfigured("Supabase auth"),
    };
  }

  const access = await getAppAccess();
  if (!access) {
    return { ok: false, response: unauthorized() };
  }
  if (!access.profile.access_code_id) {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, access };
}
