"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldClassName } from "@/components/auth/AuthCard";
import { updatePassword, type AuthActionState } from "@/lib/auth/actions";

const initial: AuthActionState = { error: null };

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="New password">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={fieldClassName}
        />
      </Field>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
    </form>
  );
}
