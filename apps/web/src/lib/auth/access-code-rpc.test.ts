import { describe, expect, it } from "vitest";
import { parseAccessCodeRpc } from "./access-code-rpc";

describe("parseAccessCodeRpc", () => {
  it("accepts successful redemption and replay", () => {
    expect(parseAccessCodeRpc({ ok: true, id: "code-1", already: true }, "fallback")).toEqual({
      ok: true,
      id: "code-1",
      already: true,
    });
  });

  it("surfaces denial errors without treating them as success", () => {
    expect(
      parseAccessCodeRpc({ ok: false, error: "That code has already been used." }, "fallback"),
    ).toEqual({ ok: false, error: "That code has already been used." });
    expect(parseAccessCodeRpc(null, "Could not redeem that code. Try again.")).toEqual({
      ok: false,
      error: "Could not redeem that code. Try again.",
    });
  });
});
