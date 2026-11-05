import { describe, expect, it } from "vitest";
import { isInvalidRefreshToken, isSupabaseSessionCookie } from "./refresh-token";

describe("Supabase refresh-token recovery", () => {
  it("recognizes the invalid refresh-token response", () => {
    expect(isInvalidRefreshToken({ code: "refresh_token_not_found" })).toBe(true);
    expect(
      isInvalidRefreshToken({ message: "Invalid Refresh Token: Refresh Token Not Found" }),
    ).toBe(true);
    expect(isInvalidRefreshToken({ code: "invalid_credentials" })).toBe(false);
    expect(isInvalidRefreshToken(null)).toBe(false);
  });

  it("matches auth session cookies and chunks, not unrelated Supabase cookies", () => {
    expect(isSupabaseSessionCookie("sb-project-auth-token")).toBe(true);
    expect(isSupabaseSessionCookie("sb-project-auth-token.0")).toBe(true);
    expect(isSupabaseSessionCookie("sb-project-refresh-token")).toBe(true);
    expect(isSupabaseSessionCookie("sb-project-code-verifier")).toBe(false);
    expect(isSupabaseSessionCookie("other-cookie")).toBe(false);
  });
});
