"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import {
  clearAccessCodeCookie,
  readAccessCodeCookie,
  redeemAccessCodeForUser,
  setAccessCodeCookie,
  lookupValidAccessCode,
} from "@/lib/auth/access-code";

export type AuthActionState = { error: string | null };

function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/app";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

export async function validateAccessCode(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "");
  const next = safeNextPath(formData.get("next"));
  const result = await lookupValidAccessCode(code);
  if (!result.ok) return { error: result.error };

  await setAccessCodeCookie(result.row.code);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const redeemed = await redeemAccessCodeForUser(user.id, result.row.code);
    if (!redeemed.ok) return { error: redeemed.error };
    await clearAccessCodeCookie();
    redirect(next);
  }

  redirect(`/signup?next=${encodeURIComponent(next)}`);
}

export async function signInWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next);
}

export async function signUpWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }

  const pendingCode = await readAccessCodeCookie();
  if (!pendingCode) {
    redirect(`/access?next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const origin = getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: error.message };

  if (data.user) {
    const redeemed = await redeemAccessCodeForUser(data.user.id, pendingCode);
    if (!redeemed.ok) return { error: redeemed.error };
    await clearAccessCodeCookie();
  }

  if (!data.session) {
    redirect("/login?checkEmail=1");
  }

  redirect(next);
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email on your account." };

  const supabase = await createClient();
  const origin = getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/update-password`,
  });
  if (error) return { error: error.message };

  redirect("/reset-password?sent=1");
}

export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
