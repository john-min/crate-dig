import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { safeStorage } from "electron";
import type { AuthSession } from "@crate-dig/contracts";
import type { CloudSyncState } from "../shared/native-api";
import {
  readPublishableSupabaseConfig,
  supabaseClientAuthOptions,
} from "./auth-config";

export type AuthStore = {
  enabled: boolean;
  session: AuthSession | null;
  refreshToken?: string;
};

export class OptionalCloudAuth {
  private enabled = false;
  private session: AuthSession | null = null;
  private refreshToken: string | undefined;
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "cloud-sync", "session.bin");
  }

  getState(): CloudSyncState {
    const configured = readPublishableSupabaseConfig() != null;
    return {
      enabled: this.enabled,
      session: this.session,
      configured,
      message: this.enabled
        ? configured
          ? undefined
          : "Cloud sync is on, but CRATE_DIG_SUPABASE_URL / CRATE_DIG_SUPABASE_PUBLISHABLE_KEY are missing."
        : "Cloud sync is off. No Supabase requests are made.",
    };
  }

  load(): CloudSyncState {
    try {
      const stored = decryptJson<AuthStore>(readFileSync(this.filePath));
      this.enabled = stored.enabled;
      this.session = stored.session;
      this.refreshToken = stored.refreshToken;
    } catch {
      this.enabled = false;
      this.session = null;
      this.refreshToken = undefined;
    }
    return this.getState();
  }

  setEnabled(enabled: boolean): CloudSyncState {
    this.enabled = enabled;
    if (!enabled) {
      this.session = null;
      this.refreshToken = undefined;
    }
    this.persist();
    return this.getState();
  }

  async signIn(): Promise<{ state: CloudSyncState; authorizationUrl?: string }> {
    if (!this.enabled) {
      return {
        state: {
          ...this.getState(),
          message:
            "Enable cloud sync before signing in. Offline import and playback do not need an account.",
        },
      };
    }
    const config = readPublishableSupabaseConfig();
    if (!config) {
      return { state: this.getState() };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(config.url, config.publishableKey, {
      auth: supabaseClientAuthOptions(),
    });
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "cratedig://auth/callback",
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      return {
        state: {
          ...this.getState(),
          message: error?.message ?? "Supabase did not return a sign-in URL.",
        },
      };
    }
    return { state: this.getState(), authorizationUrl: data.url };
  }

  async completeFromCallback(url: string): Promise<CloudSyncState> {
    if (!this.enabled) return this.getState();
    const config = readPublishableSupabaseConfig();
    if (!config) return this.getState();
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (!code) {
      return { ...this.getState(), message: "Auth callback did not include a code." };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(config.url, config.publishableKey, {
      auth: supabaseClientAuthOptions(),
    });
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session?.user) {
      return { ...this.getState(), message: error?.message ?? "Could not exchange auth code." };
    }
    this.session = {
      userId: data.session.user.id,
      email: data.session.user.email ?? undefined,
      expiresAt: data.session.expires_at
        ? new Date(data.session.expires_at * 1000).toISOString()
        : undefined,
    };
    this.refreshToken = data.session.refresh_token;
    this.persist();
    return this.getState();
  }

  signOut(): CloudSyncState {
    this.session = null;
    this.refreshToken = undefined;
    this.persist();
    return this.getState();
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload: AuthStore = {
      enabled: this.enabled,
      session: this.session,
      refreshToken: this.refreshToken,
    };
    writeFileSync(this.filePath, encryptJson(payload));
  }
}

function encryptJson(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(bytes.toString("base64"));
  }
  return bytes;
}

function decryptJson<T>(buf: Buffer): T {
  const json = safeStorage.isEncryptionAvailable()
    ? Buffer.from(safeStorage.decryptString(buf), "base64").toString("utf8")
    : buf.toString("utf8");
  return JSON.parse(json) as T;
}
