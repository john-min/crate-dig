"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldClassName } from "@/components/auth/AuthCard";
import { validateAccessCode, type AuthActionState } from "@/lib/auth/actions";
import { ACCESS_MESSAGES } from "@/lib/auth/auth-messages";

const initial: AuthActionState = { error: null };

export function AccessCodeForm({
  next = "/app",
  configured = true,
}: {
  next?: string;
  configured?: boolean;
}) {
  const [state, action, pending] = useActionState(validateAccessCode, initial);
  const error = configured ? state.error : ACCESS_MESSAGES.notConfigured;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="Access code">
        <input
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required={configured}
          disabled={!configured}
          aria-invalid={Boolean(error)}
          placeholder="Enter your code"
          className={`${fieldClassName} tracking-[0.12em] disabled:opacity-50`}
        />
      </Field>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button disabled={pending || !configured}>{pending ? "Checking…" : "Continue"}</Button>
    </form>
  );
}
