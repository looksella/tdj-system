// ============================================================
// PLATFORM FILE — app/api/beon/ia/extraer/route.ts
// Generado e inyectado por TuSistema. NO editar ni reescribir.
// Es el puente entre la pieza `<CargarDesdeArchivo>` (navegador)
// y `extraerDatos` (servidor): el navegador no puede hablar con
// el proxy porque el token del proyecto es server-only.
//
// No importa nada de la app ni del overlay de auth a propósito:
// tiene que buildear en TODO sistema, tenga o no login. Su
// exposición es la misma que la de cualquier ruta de esa app; el
// gate real es el proxy (token por sistema, límite por minuto y
// fusible diario de créditos).
// ============================================================
import { NextResponse } from "next/server";
import { extraerDatos, MAX_ARCHIVOS, type ArchivoEntrada, type Campo } from "@/lib/beon-ia";
// Leer una factura larga en PDF es la llamada de IA más lenta de una app.
// 300 es el mismo techo que la plataforma le exige a cualquier ruta que use IA.
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let body: {
    archivos?: ArchivoEntrada[];
    campos?: Campo[];
    contexto?: string;
    locale?: "es" | "pt";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "error", message: "Pedido inválido." },
      { status: 400 },
    );
  }
  const archivos = Array.isArray(body.archivos) ? body.archivos : [];
  const campos = Array.isArray(body.campos) ? body.campos : [];
  if (!archivos.length || archivos.length > MAX_ARCHIVOS || !campos.length) {
    return NextResponse.json(
      {
        ok: false,
        code: "archivo_ilegible",
        message: `Subí entre 1 y ${MAX_ARCHIVOS} archivos.`,
      },
      { status: 400 },
    );
  }
  const resultado = await extraerDatos({
    archivos,
    campos,
    contexto: body.contexto,
    locale: body.locale === "pt" ? "pt" : "es",
  });
  // Siempre 200: el componente lee `ok` y muestra el mensaje. Un status de
  // error acá lo tomaría el navegador como "se rompió el sistema".
  return NextResponse.json(resultado);
}
