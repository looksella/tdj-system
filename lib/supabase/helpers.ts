// Server-only: do not import from a client component.
import { createServerClient } from "./server";
import { LOGIN_ACTIVO } from "./estado";

export type EffectiveUser = {
  id: string;
  email: string;
  role: string;
};

/** Validates the Supabase session and returns trusted app metadata. */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  if (!LOGIN_ACTIVO) return null;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    // Roles are trusted only in app_metadata, which clients cannot edit.
    role: (user.app_metadata?.role as string | undefined) ?? "customer",
  };
}
