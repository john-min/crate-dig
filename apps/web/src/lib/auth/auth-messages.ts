/** Account copy from the v2 HTML — messages only, not preview chips. */

export const ACCESS_MESSAGES = {
  empty: "Enter an access code.",
  notConfigured: "Access codes are not configured on this server.",
  invalid: "That access code isn’t recognized. Check for typos and try again.",
  expired: "This access code has expired. Request a new one from your invite.",
  limit: "This access code has reached its redemption limit.",
  unavailable: "We can’t validate access codes right now. Try again in a moment.",
} as const;

export const AUTH_MESSAGES = {
  emailRequired: "Enter a valid email address.",
  passwordRequired: "Email and password are required.",
  weakPassword: "Use at least 8 characters, including a number.",
  emailRegistered: "An account already exists for this email. Sign in instead.",
  googleFailed:
    "Google sign-up was cancelled or didn’t complete. Try again, or continue with email.",
  googleSignInFailed: "Google sign-in did not complete. Try again, or use email.",
  credentials: "Email or password doesn’t match. Try again, or reset your password.",
  supabaseMissing:
    "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  resetEmail: "Enter the email on your account.",
} as const;

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /\d/.test(password);
}

export function mapSupabaseAuthError(message: string): {
  error: string;
  signInInstead?: boolean;
} {
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return { error: AUTH_MESSAGES.emailRegistered, signInInstead: true };
  }
  if (lower.includes("password")) {
    return { error: AUTH_MESSAGES.weakPassword };
  }
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return { error: AUTH_MESSAGES.credentials };
  }
  if (lower.includes("unable to validate email") || lower.includes("invalid email")) {
    return { error: AUTH_MESSAGES.emailRequired };
  }
  return { error: message };
}

export function isMissingSupabaseConfig(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("NEXT_PUBLIC_SUPABASE") || error.message.includes("SUPABASE_SECRET")
  );
}
