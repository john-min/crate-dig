"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldClassName } from "@/components/auth/AuthCard";
import { validateAccessCode, type AuthActionState } from "@/lib/auth/actions";

const initial: AuthActionState = { error: null };

export function AccessCodeForm({ next = "/app" }: { next?: string }) {
  const [state, action, pending] = useActionState(validateAccessCode, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="Access code">
        <input
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          placeholder="CRATEDIG-…"
          className={`${fieldClassName} tracking-[0.12em]`}
        />
      </Field>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button disabled={pending}>{pending ? "Checking…" : "Continue"}</Button>
    </form>
  );
}
