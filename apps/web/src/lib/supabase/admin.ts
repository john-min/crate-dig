import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabasePublishableEnv,
  requireSupabasePublishableEnv,
  requireSupabaseSecretKey,
} from "@/lib/env";

/** Service-role client. Server-only. Never import from client components. */
export function createAdminClient() {
  const { url } = requireSupabasePublishableEnv();
  const secret = requireSupabaseSecretKey();
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function tryCreateAdminClient(): SupabaseClient | null {
  const env = getSupabasePublishableEnv();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!env || !secret) return null;
  return createClient(env.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
