"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import {
  hasValidAccessCodeCookie,
  setAccessCodeCookie,
  lookupValidAccessCode,
} from "@/lib/auth/access-code";
import {
  AUTH_MESSAGES,
  isMissingSupabaseConfig,
  isStrongPassword,
  mapSupabaseAuthError,
} from "@/lib/auth/auth-messages";

export type AuthActionState = { error: string | null; signInInstead?: boolean };

function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/app";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

async function getOptionalUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { ok: true as const, user };
  } catch (error) {
    if (isMissingSupabaseConfig(error)) {
      return { ok: false as const, error: AUTH_MESSAGES.supabaseMissing };
    }
    throw error;
  }
}

export async function validateAccessCode(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "");
  const next = safeNextPath(formData.get("next"));
  const result = lookupValidAccessCode(code);
  if (!result.ok) return { error: result.error };

  await setAccessCodeCookie(result.code);

  const session = await getOptionalUser();
  if (session.ok && session.user) {
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
    return { error: AUTH_MESSAGES.passwordRequired };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return mapSupabaseAuthError(error.message);
  } catch (error) {
    if (isMissingSupabaseConfig(error)) {
      return { error: AUTH_MESSAGES.supabaseMissing };
    }
    throw error;
  }

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
    return { error: AUTH_MESSAGES.passwordRequired };
  }
  if (!isStrongPassword(password)) {
    return { error: AUTH_MESSAGES.weakPassword };
  }

  if (!(await hasValidAccessCodeCookie())) {
    redirect(`/access?next=${encodeURIComponent(next)}`);
  }

  try {
    const supabase = await createClient();
    const origin = getSiteUrl();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) return mapSupabaseAuthError(error.message);

    if (!data.session) {
      redirect("/login?checkEmail=1");
    }
  } catch (error) {
    if (isMissingSupabaseConfig(error)) {
      return { error: AUTH_MESSAGES.supabaseMissing };
    }
    throw error;
  }

  redirect(next);
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: AUTH_MESSAGES.resetEmail };

  try {
    const supabase = await createClient();
    const origin = getSiteUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/confirm?next=/update-password`,
    });
    if (error) return mapSupabaseAuthError(error.message);
  } catch (error) {
    if (isMissingSupabaseConfig(error)) {
      return { error: AUTH_MESSAGES.supabaseMissing };
    }
    throw error;
  }

  redirect("/reset-password?sent=1");
}

export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  if (!isStrongPassword(password)) {
    return { error: AUTH_MESSAGES.weakPassword };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return mapSupabaseAuthError(error.message);
  } catch (error) {
    if (isMissingSupabaseConfig(error)) {
      return { error: AUTH_MESSAGES.supabaseMissing };
    }
    throw error;
  }

  redirect("/app");
}

export async function signOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    if (!isMissingSupabaseConfig(error)) throw error;
  }
  redirect("/");
}
