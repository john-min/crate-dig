"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldClassName } from "@/components/auth/AuthCard";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { signInWithEmail, type AuthActionState } from "@/lib/auth/actions";
import { AUTH_MESSAGES } from "@/lib/auth/auth-messages";

const initial: AuthActionState = { error: null };

export function LoginForm({
  next = "/app",
  checkEmail = false,
  oauthError = false,
}: {
  next?: string;
  checkEmail?: boolean;
  oauthError?: boolean;
}) {
  const [state, action, pending] = useActionState(signInWithEmail, initial);

  return (
    <div className="flex flex-col gap-6">
      <GoogleButton next={next} />
      <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.16em] text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClassName}
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={fieldClassName}
          />
        </Field>
        {checkEmail ? (
          <p className="text-sm text-paper-dim">
            Check your email to confirm the account, then sign in.
          </p>
        ) : null}
        {oauthError ? (
          <p className="text-sm text-danger" role="alert">
            {AUTH_MESSAGES.googleSignInFailed}
          </p>
        ) : null}
        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="text-sm text-muted">
        <Link href="/reset-password" className="text-paper-dim hover:text-paper">
          Forgot password
        </Link>
      </p>
    </div>
  );
}
