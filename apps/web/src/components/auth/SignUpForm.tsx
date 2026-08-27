"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldClassName } from "@/components/auth/AuthCard";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { signUpWithEmail, type AuthActionState } from "@/lib/auth/actions";
import { AUTH_MESSAGES } from "@/lib/auth/auth-messages";

const initial: AuthActionState = { error: null };

export function SignUpForm({ next = "/app" }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpWithEmail, initial);

  return (
    <div className="flex flex-col gap-6">
      <GoogleButton next={next} label="Continue with Google" />
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
            aria-invalid={Boolean(state.signInInstead)}
            className={fieldClassName}
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby="password-hint"
            className={fieldClassName}
          />
        </Field>
        <p id="password-hint" className="text-[13px] text-paper-dim">
          {AUTH_MESSAGES.weakPassword}
        </p>
        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.signInInstead ? (
              <>
                An account already exists for this email.{" "}
                <Link href="/login" className="text-amber hover:underline">
                  Sign in instead
                </Link>
                .
              </>
            ) : (
              state.error
            )}
          </p>
        ) : null}
        <Button disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
      </form>
    </div>
  );
}
