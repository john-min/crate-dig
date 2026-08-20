import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const ACCESS_CODE_COOKIE = "cd_access_code";

const COOKIE_MAX_AGE = 60 * 60;

export type AccessCodeRow = {
  id: string;
  code: string;
  max_redemptions: number;
  redemption_count: number;
  expires_at: string | null;
};

export async function lookupValidAccessCode(
  code: string,
): Promise<{ ok: true; row: AccessCodeRow } | { ok: false; error: string }> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Enter an access code." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("access_codes")
    .select("id, code, max_redemptions, redemption_count, expires_at")
    .eq("code", trimmed)
    .maybeSingle();

  if (error) return { ok: false, error: "Could not validate that code." };
  if (!data) return { ok: false, error: "That code is not valid." };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That code has expired." };
  }
  if (data.redemption_count >= data.max_redemptions) {
    return { ok: false, error: "That code has already been used." };
  }

  return { ok: true, row: data as AccessCodeRow };
}

export async function setAccessCodeCookie(code: string) {
  const store = await cookies();
  store.set(ACCESS_CODE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function readAccessCodeCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_CODE_COOKIE)?.value;
}

export async function clearAccessCodeCookie() {
  const store = await cookies();
  store.delete(ACCESS_CODE_COOKIE);
}

export async function redeemAccessCodeForUser(
  userId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("access_code_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.access_code_id) return { ok: true };

  const looked = await lookupValidAccessCode(code);
  if (!looked.ok) return looked;

  const { error: updateError } = await admin
    .from("access_codes")
    .update({ redemption_count: looked.row.redemption_count + 1 })
    .eq("id", looked.row.id)
    .eq("redemption_count", looked.row.redemption_count);

  if (updateError) {
    return { ok: false, error: "Could not redeem that code. Try again." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ access_code_id: looked.row.id })
    .eq("id", userId);

  if (profileError) {
    return { ok: false, error: "Could not attach the access code to your account." };
  }

  return { ok: true };
}
