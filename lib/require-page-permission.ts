import { redirect } from "next/navigation";
import { isAllowed } from "@/lib/auth-helpers";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export async function requirePagePermission(permission: string) {
  const user = await getEffectiveUser();
  if (!user) redirect("/sign-in");
  if (!isAllowed(user.role, permission)) redirect("/ventas");
  return user;
}
