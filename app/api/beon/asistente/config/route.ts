// ============================================================
// PLATFORM FILE — app/api/beon/asistente/config/route.ts
// Generado e inyectado por TuSistema. NO editar ni reescribir.
// Dice si el módulo "Asistente IA" se muestra. Lo consultan la
// página y el runtime de la plataforma, que esconde el ítem del
// menú cuando el dueño lo ocultó. Sin sesión responde apagado en
// vez de 401: es una respuesta pública inofensiva y el runtime la
// pide antes de saber quién está mirando.
// ============================================================
import { NextResponse } from "next/server";
import { configuracion } from "@/lib/beon-asistente";
import { getEffectiveUser } from "@/lib/supabase/helpers";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = await configuracion();
  const user = await getEffectiveUser();
  // Un usuario que no es admin no ve el módulo, aunque esté activo para el
  // sistema: en v1 el asistente es del dueño y de los admins de su app.
  const visible = config.enabled && user?.role === "admin";
  return NextResponse.json({
    enabled: visible,
    suggestedQuestions: visible ? config.suggestedQuestions : [],
    creditsPerQuestionHint: config.creditsPerQuestionHint,
    ownerHasCredits: config.ownerHasCredits,
  });
}
