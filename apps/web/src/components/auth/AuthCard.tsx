import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col px-6 py-8">
      <header className="mx-auto flex w-full max-w-md items-center justify-between">
        <Wordmark />
        <Link href="/" className="text-sm text-muted transition-colors hover:text-paper">
          Back
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
        <h1 className="font-serif text-[2.25rem] leading-tight tracking-tight text-paper">
          {title}
        </h1>
        <div className="mt-10">{children}</div>
        {footer ? <div className="mt-10 text-sm text-muted">{footer}</div> : null}
      </main>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] tracking-wide text-paper-dim">{label}</span>
      {children}
    </label>
  );
}

export const fieldClassName =
  "h-11 w-full rounded-lg border border-line bg-ink-raised px-3.5 text-[15px] text-paper outline-none placeholder:text-muted/70 focus:border-amber/50";
