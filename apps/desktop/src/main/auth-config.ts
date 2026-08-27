const SECRET_ENV_KEYS = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_API_TOKEN",
] as const;

export type PublishableSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function readPublishableSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublishableSupabaseConfig | null {
  const url = env.CRATE_DIG_SUPABASE_URL?.trim();
  const publishableKey = env.CRATE_DIG_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function presentSecretEnvKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return SECRET_ENV_KEYS.filter((key) => Boolean(env[key]?.trim()));
}

export function supabaseClientAuthOptions() {
  return { persistSession: false, autoRefreshToken: false } as const;
}
