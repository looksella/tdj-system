export function isInvalidRefreshToken(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (
    ("code" in error && error.code === "refresh_token_not_found") ||
    ("message" in error &&
      typeof error.message === "string" &&
      error.message.includes("Invalid Refresh Token: Refresh Token Not Found"))
  );
}

export function isSupabaseSessionCookie(name: string): boolean {
  return /^sb-.+-(?:auth-token(?:\.\d+)?|access-token|refresh-token)$/.test(name);
}
