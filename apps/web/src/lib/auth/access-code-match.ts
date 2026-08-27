import { createHash, timingSafeEqual } from "node:crypto";
import { ACCESS_MESSAGES } from "@/lib/auth/auth-messages";

function normalizeAccessCode(value: string): string {
  return value.trim().toUpperCase();
}

function digest(value: string): Buffer {
  return createHash("sha256").update(normalizeAccessCode(value), "utf8").digest();
}

/** Constant-time compare of two access codes (length-independent via SHA-256). */
export function accessCodesMatch(input: string, expected: string): boolean {
  return timingSafeEqual(digest(input), digest(expected));
}

export function configuredAccessCode(): string | null {
  const value = process.env.ACCESS_CODE?.trim();
  return value ? value : null;
}

export function isAccessCodeConfigured(): boolean {
  return configuredAccessCode() !== null;
}

export type AccessCodeLookup =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Canonical prototype gate: env ACCESS_CODE only.
 * Fails closed when unset. Does not call DB RPCs.
 */
export function lookupValidAccessCode(code: string): AccessCodeLookup {
  const expected = configuredAccessCode();
  if (!expected) return { ok: false, error: ACCESS_MESSAGES.notConfigured };

  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: ACCESS_MESSAGES.empty };
  if (!accessCodesMatch(trimmed, expected)) {
    return { ok: false, error: ACCESS_MESSAGES.invalid };
  }
  return { ok: true, code: trimmed };
}
