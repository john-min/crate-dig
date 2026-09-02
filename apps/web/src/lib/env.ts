export type PublicAppMode = "mock" | "local" | "cloud" | "preview";

export function getPublicAppMode(): PublicAppMode | undefined {
  const value = process.env.NEXT_PUBLIC_APP_MODE;
  if (value === "mock" || value === "local" || value === "cloud" || value === "preview") {
    return value;
  }
  return undefined;
}

export function isCloudAppMode(): boolean {
  return getPublicAppMode() === "cloud";
}

export function isPreviewAppMode(): boolean {
  return getPublicAppMode() === "preview";
}

export function isAuthGatedAppMode(): boolean {
  return isCloudAppMode();
}

export function getSupabasePublishableEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function requireSupabasePublishableEnv(): { url: string; key: string } {
  const env = getSupabasePublishableEnv();
  if (!env) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return env;
}

export function requireSupabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SECRET_KEY (server only)");
  }
  return key;
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
