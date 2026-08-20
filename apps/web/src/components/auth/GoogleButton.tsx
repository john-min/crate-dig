"use client";

import { createClient } from "@/lib/supabase/client";

export function GoogleButton({
  next = "/app",
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  async function onClick() {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-ink-raised text-[15px] font-medium tracking-tight text-paper transition-colors hover:bg-ink-hover"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
        <path
          fill="currentColor"
          d="M21.35 11.1h-9.18v2.96h5.27c-.23 1.5-1.78 4.4-5.27 4.4-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.54 4.2 14.5 3.3 12.17 3.3 7.36 3.3 3.5 7.16 3.5 12s3.86 8.7 8.67 8.7c5.01 0 8.33-3.52 8.33-8.48 0-.57-.06-1-.15-1.12z"
        />
      </svg>
      {label}
    </button>
  );
}
