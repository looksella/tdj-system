export default function SinPermisoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Acceso restringido
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">No tienes acceso a esta herramienta.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Tu cuenta no tiene el permiso necesario para abrir esta sección. Contactá al administrador si
          necesitás acceso.
        </p>
      </div>
    </main>
  );
}
