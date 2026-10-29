"use client";
// Next.js boundary for errors that escape the root layout.
import { useEffect } from "react";
import { idiomaDelNegocio } from "@/lib/beon-idioma";
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
  const idioma: "es" | "pt" = idiomaDelNegocio();
  const copy = COPY[idioma];
  useEffect(() => {
    console.error("Application error:", error);
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
