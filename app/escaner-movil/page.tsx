import { notFound, redirect } from "next/navigation";
import { RemoteScannerMobile } from "@/components/scanner/remote-scanner-mobile";
import { isRemoteScannerEnabled } from "@/lib/remote-scanner-config";
import { isAllowed } from "@/lib/auth-helpers";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export const metadata = { title: "Escáner móvil" };

export default async function RemoteScannerMobilePage() {
  if (!isRemoteScannerEnabled()) notFound();

  const user = await getEffectiveUser();
  if (!user) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent("/escaner-movil")}`);
  }
  if (!isAllowed(user.role, "pos:read") && !isAllowed(user.role, "inventory:read")) {
    redirect("/ventas");
  }

  return <RemoteScannerMobile />;
}
