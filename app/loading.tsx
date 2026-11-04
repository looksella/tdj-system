import { LoaderCircle, Package } from "lucide-react";

export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Cargando la página"
      className="flex min-h-[70vh] items-center justify-center px-4 py-10"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3 text-primary">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Package className="size-5" aria-hidden="true" />
          </span>
          <span className="display-heading text-xl font-semibold text-foreground">
            Tienda Don Juan
          </span>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
            Cargando tu espacio…
          </div>
          <div className="space-y-3" aria-hidden="true">
            <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted/70" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
              <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
              <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            </div>
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </main>
  );
}
