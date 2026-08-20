"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldClassName } from "@/components/auth/AuthCard";
import { requestPasswordReset, type AuthActionState } from "@/lib/auth/actions";

const initial: AuthActionState = { error: null };

export function ResetPasswordForm({ sent = false }: { sent?: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (sent) {
    return (
      <p className="text-[15px] leading-relaxed text-paper-dim">
        If that email is on an account, a reset link is on its way.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClassName}
        />
      </Field>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
