import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublishableEnv } from "@/lib/env";

export function createClient() {
  const { url, key } = requireSupabasePublishableEnv();
  return createBrowserClient(url, key);
}
