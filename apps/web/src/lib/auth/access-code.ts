import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseAccessCodeRpc } from "@/lib/auth/access-code-rpc";

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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_access_code", { p_code: trimmed });
  if (error) return { ok: false, error: "Could not validate that code." };

  const result = parseAccessCodeRpc(data, "Could not validate that code.");
  if (!result.ok) return result;
  return {
    ok: true,
    row: {
      id: result.id ?? "validated",
      code: result.code ?? trimmed,
      max_redemptions: 1,
      redemption_count: 0,
      expires_at: null,
    },
  };
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
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Enter an access code." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const invoke =
    user?.id === userId
      ? supabase.rpc("redeem_access_code", { p_code: trimmed, p_user_id: userId })
      : createAdminClient().rpc("redeem_access_code", { p_code: trimmed, p_user_id: userId });

  const { data, error } = await invoke;
  if (error) return { ok: false, error: "Could not redeem that code. Try again." };
  const result = parseAccessCodeRpc(data, "Could not redeem that code. Try again.");
  if (!result.ok) return result;
  return { ok: true };
}
