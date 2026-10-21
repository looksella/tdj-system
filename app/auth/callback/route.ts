import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
/**
 * Aterrizaje del code exchange PKCE de logins OAuth (`?code=XXX`).
 *
 * NO es intercambiable con /auth/confirm, que es el de los links de email.
 *
 * Cuando falla, la persona va a `/auth/acceso?motivo=…&flujo=…` y NUNCA al login
 * con un parámetro de error colgado: `/sign-in` no lee ninguno (ver
 * /auth/confirm).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";
  // Sin `code` no hay nada que intercambiar: el link llegó cortado.
  if (!code) {
    return aAcceso(request, "link_incompleto", type);
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    // invite y recovery: el usuario llega logueado pero SIN contraseña.
    if (type === "recovery" || type === "invite") {
      return NextResponse.redirect(new URL("/reset-password", request.url));
    }
    return NextResponse.redirect(new URL(next, request.url));
  }
  return aAcceso(request, motivoDelError(error), type);
}
/** Mismo criterio que /auth/confirm: el link ya usado es el caso frecuente. */
function motivoDelError(error: { code?: string; message?: string }): string {
  const s = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (s.includes("otp_expired") || s.includes("expired or is invalid")) {
    return "link_usado";
  }
  return "verificacion_fallida";
}
/** `/auth/acceso` explica qué pasó y ofrece la salida (ver esa página). */
function aAcceso(request: NextRequest, motivo: string, flujo: string | null) {
  const url = new URL("/auth/acceso", request.url);
  url.searchParams.set("motivo", motivo);
  if (flujo) url.searchParams.set("flujo", flujo);
  return NextResponse.redirect(url);
}
