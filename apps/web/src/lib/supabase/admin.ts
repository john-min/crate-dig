import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublishableEnv, requireSupabaseSecretKey } from "@/lib/env";

/** Service-role client. Server-only. Never import from client components. */
export function createAdminClient() {
  const { url } = requireSupabasePublishableEnv();
  const secret = requireSupabaseSecretKey();
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
