import { Sidebar } from "@/components/workspace/sidebar";
export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}