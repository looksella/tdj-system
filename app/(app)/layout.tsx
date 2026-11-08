import { Sidebar } from "@/components/workspace/sidebar";
import { redirect } from "next/navigation";
import { getEnabledFeatureKeys } from "@/lib/features/resolve";
import { getEffectivePermissionList } from "@/lib/permissions/resolve";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getEffectiveUser();
  if (!user) redirect("/sign-in");

  const [permissions, features] = await Promise.all([
    getEffectivePermissionList(user),
    getEnabledFeatureKeys(),
  ]);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar permissions={permissions} features={features} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
