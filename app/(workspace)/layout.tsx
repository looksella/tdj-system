import { Sidebar } from "@/components/workspace/sidebar";
import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/lib/supabase/helpers";
export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getEffectiveUser();
  if (!user) redirect("/sign-in");
  return (
    <div className="min-h-screen md:flex">
      <Sidebar role={user.role} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}