"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error al renderizar una página.", error);
  }, [error]);

  return (
    <main role="alert" className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-7 text-center shadow-sm">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="display-heading text-2xl font-semibold">No pudimos cargar esta página</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocurrió un problema inesperado. Puedes intentar cargarla de nuevo.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">Código de referencia: {error.digest}</p>
        )}
        <Button type="button" onClick={reset} className="mt-6">
          Intentar de nuevo
        </Button>
      </div>
    </main>
  );
}
