import { afterEach, describe, expect, it } from "vitest";
import {
  accessCodesMatch,
  lookupValidAccessCode,
} from "./access-code-match";

const original = process.env.ACCESS_CODE;

afterEach(() => {
  if (original === undefined) delete process.env.ACCESS_CODE;
  else process.env.ACCESS_CODE = original;
});

describe("accessCodesMatch", () => {
  it("matches regardless of case and surrounding space", () => {
    expect(accessCodesMatch("thonglor", "THONGLOR")).toBe(true);
    expect(accessCodesMatch("  THONGLOR  ", "thonglor")).toBe(true);
  });

  it("rejects a different code", () => {
    expect(accessCodesMatch("WRONG", "THONGLOR")).toBe(false);
  });
});

describe("lookupValidAccessCode", () => {
  it("fails closed when ACCESS_CODE is unset", () => {
    delete process.env.ACCESS_CODE;
    expect(lookupValidAccessCode("THONGLOR")).toEqual({
      ok: false,
      error: "Access codes are not configured on this server.",
    });
  });

  it("fails closed when ACCESS_CODE is blank", () => {
    process.env.ACCESS_CODE = "   ";
    expect(lookupValidAccessCode("THONGLOR")).toEqual({
      ok: false,
      error: "Access codes are not configured on this server.",
    });
  });

  it("rejects a wrong code against a configured secret", () => {
    process.env.ACCESS_CODE = "THONGLOR";
    expect(lookupValidAccessCode("NOPE")).toEqual({
      ok: false,
      error: "That access code isn’t recognized. Check for typos and try again.",
    });
  });

  it("accepts the configured code", () => {
    process.env.ACCESS_CODE = "THONGLOR";
    expect(lookupValidAccessCode("thonglor")).toEqual({ ok: true, code: "thonglor" });
  });
});
