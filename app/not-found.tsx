import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="display-heading text-3xl">No encontramos esa página</h1>
      <p className="text-sm text-muted-foreground">Revisá la dirección o volvé al inicio.</p>
      <Link href="/" className="text-sm font-semibold text-primary underline">
        Ir al inicio
      </Link>
    </main>
  );
}
export const metadata = { title: "Página no encontrada" };
