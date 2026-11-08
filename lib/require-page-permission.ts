import { redirect } from "next/navigation";
import { getEffectivePermissions, hasPermission } from "@/lib/permissions/resolve";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export async function requirePermission(permission: string) {
  const user = await getEffectiveUser();
  if (!user) redirect("/sign-in");

  const permissions = await getEffectivePermissions(user);
  if (!hasPermission(permissions, permission)) redirect("/sin-permiso");
  return user;
}

export const requirePagePermission = requirePermission;
