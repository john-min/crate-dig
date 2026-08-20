import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clearAccessCodeCookie,
  readAccessCodeCookie,
  redeemAccessCodeForUser,
} from "@/lib/auth/access-code";

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const pendingCode = await readAccessCodeCookie();
      if (user && pendingCode) {
        const redeemed = await redeemAccessCodeForUser(user.id, pendingCode);
        if (redeemed.ok) await clearAccessCodeCookie();
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
