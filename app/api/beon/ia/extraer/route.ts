// Extracts structured data from uploaded files using the configured AI service.
import { NextResponse } from "next/server";
import { extraerDatos, MAX_ARCHIVOS, type ArchivoEntrada, type Campo } from "@/lib/beon-ia";
import { isAllowed } from "@/lib/auth-helpers";
import { getEffectiveUser } from "@/lib/supabase/helpers";
// PDF extraction can take longer than ordinary API requests.
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await getEffectiveUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: "unauthorized", message: "Inicia sesión para continuar." }, { status: 401 });
  }
  if (!isAllowed(user.role, "assistant:access")) {
    return NextResponse.json({ ok: false, code: "forbidden", message: "No tienes permiso para usar esta función." }, { status: 403 });
  }
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
