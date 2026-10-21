"use client";
// Inyectado por el pipeline de TuSistema.AI. Boundary nativo de Next
// para errores que escapan del root layout (incluye errores del Server
// Component raíz: Prisma, fetch fallido en SSR, etc.).
// NO modificar — sobreescrito automáticamente en cada iteración.
//
// Complementa a instrumentation-client.ts: aquel cubre window.onerror +
// unhandledrejection (errores que ocurren en el cliente ya hidratado);
// este cubre errores que Next capturó server-side y propaga al boundary
// cliente. Entre los dos, cobertura completa de runtime errors visibles
// al usuario.
import { useEffect } from "react";
import { idiomaDelNegocio } from "@/lib/beon-idioma";
// El idioma del NEGOCIO, no el del visitante: esta pantalla la ve el cliente
// del dueño, que puede tener el teléfono en cualquier idioma. Los dos archivos
// los escribe el mismo inyector de platform files, así que `lib/beon-idioma.ts`
// está siempre que esté este.
const COPY = {
  es: {
    titulo: "Algo salió mal.",
    detalle: "Estamos al tanto. Probá recargar en unos segundos.",
  },
  pt: {
    titulo: "Algo deu errado.",
    detalle: "Já estamos cientes. Tente recarregar em alguns segundos.",
  },
};
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  // Anotado a mano: este archivo también lo typechequea el repo de la
  // plataforma, donde el alias `@/` apunta a otro lado y el import resuelve a
  // `any`. Sin la anotación, indexar `COPY` sería un `any` implícito.
  const idioma: "es" | "pt" = idiomaDelNegocio();
  const copy = COPY[idioma];
  useEffect(() => {
    try {
      window.parent?.postMessage(
        {
          __beon: true,
          type: "runtime_error",
          payload: {
            kind: "global-error-boundary",
            message: String(error?.message ?? error),
            stack: error?.stack?.slice(0, 4000),
            source: error?.digest,
          },
        },
        "*",
      );
    } catch {
      // no-op intencional: sin red propia no hay otro destino
    }
  }, [error]);
  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h2>{copy.titulo}</h2>
          <p>{copy.detalle}</p>
        </div>
      </body>
    </html>
  );
}
