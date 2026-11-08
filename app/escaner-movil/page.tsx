import { notFound, redirect } from "next/navigation";
import { RemoteScannerMobile } from "@/components/scanner/remote-scanner-mobile";
import { isFeatureEnabled } from "@/lib/features/resolve";
import { getEffectivePermissions, hasPermission } from "@/lib/permissions/resolve";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export const metadata = { title: "Escáner móvil" };

export default async function RemoteScannerMobilePage() {
  if (!(await isFeatureEnabled("remote-scanner-mobile"))) notFound();

  const user = await getEffectiveUser();
  if (!user) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent("/escaner-movil")}`);
  }

  const permissions = await getEffectivePermissions(user);
  if (!hasPermission(permissions, "pos:read") && !hasPermission(permissions, "inventory:read")) {
    redirect("/sin-permiso");
  }

  return <RemoteScannerMobile />;
}
