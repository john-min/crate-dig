import "server-only";

import { cookies } from "next/headers";
import {
  accessCodesMatch,
  configuredAccessCode,
  lookupValidAccessCode,
} from "@/lib/auth/access-code-match";

export const ACCESS_CODE_COOKIE = "cd_access_code";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export { lookupValidAccessCode, configuredAccessCode };

export async function setAccessCodeCookie(code: string) {
  const store = await cookies();
  store.set(ACCESS_CODE_COOKIE, code.trim(), {
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

export async function hasValidAccessCodeCookie(): Promise<boolean> {
  const expected = configuredAccessCode();
  if (!expected) return false;
  const value = await readAccessCodeCookie();
  if (!value) return false;
  return accessCodesMatch(value, expected);
}

export async function clearAccessCodeCookie() {
  const store = await cookies();
  store.delete(ACCESS_CODE_COOKIE);
}

/**
 * Prototype redemption: env ACCESS_CODE is canonical.
 * `validate_access_code` / `redeem_access_code` RPCs remain in the repo unused.
 */
export function redeemAccessCodeForUser(
  _userId: string,
  code: string,
): { ok: true } | { ok: false; error: string } {
  const result = lookupValidAccessCode(code);
  if (!result.ok) return result;
  return { ok: true };
}
