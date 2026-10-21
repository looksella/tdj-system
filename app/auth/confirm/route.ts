import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
/**
 * Aterrizaje de los LINKS DE EMAIL (registro, invitación, recuperación, magic
 * link). Verifica server-side con `verifyOtp({ token_hash, type })`.
 *
 * NO es intercambiable con /auth/callback. Un link de email no puede usar PKCE:
 * lo genera el servidor (inviteUserByEmail, generateLink,
 * resetPasswordForEmail) y el browser que lo abre no tiene el `code_verifier`,
 * así que `exchangeCodeForSession` falla, el usuario queda activado sin sesión
 * ni contraseña, y reintentar el link ya consumido da `otp_expired`.
 *
 * ⚠️ **La verificación vive en el `POST`, no en el `GET`**
 * (SPEC_INVITACIONES_QUE_NO_SE_QUEMAN Bloque 4). Un token de un solo uso lo
 * quema CUALQUIER cosa que siga el link: el unfurler de Slack, el escáner de
 * Gmail, la previsualización de WhatsApp, un antivirus corporativo, o el admin
 * abriéndolo para comprobar que anda. En el caso testigo pasaron 5 segundos
 * entre generar el link y consumirlo, y la persona invitada recibía una
 * invitación ya rota sin que nadie pudiera reconstruir por qué.
 *
 * Entonces el `GET` no toca Supabase: manda a `/auth/confirmar`, la pantalla
 * con el botón. Un bot que sigue el link recibe HTML y nada más. El token sobrevive
 * hasta que una PERSONA aprieta el botón, que es el `POST` de acá abajo. Es lo
 * mismo que hacen GitHub, Stripe y Linear con sus links de un solo uso, y es
 * la regla vieja de que un `GET` no tiene efectos de lado.
 *
 * Los links YA emitidos siguen andando: apuntan al `GET`, que ahora muestra la
 * pantalla en vez de verificar.
 *
 * Cuando falla, la persona va a `/auth/acceso?motivo=…&flujo=…` y NUNCA al login
 * con un parámetro de error colgado: `/sign-in` no lee ningún parámetro, así
 * que el invitado veía un formulario mudo y ni él ni el soporte podían
 * distinguir un link vencido de uno cortado al copiarlo.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";
  // El link llegó cortado al copiarlo: sin token_hash o sin type no hay nada
  // que confirmar, y es un caso distinto de "el link venció".
  if (!token_hash || !type) {
    return aAcceso(request, "link_incompleto", type);
  }
  // Sin efectos de lado: solo se le pasa el sobre a la pantalla.
  const url = new URL("/auth/confirmar", request.url);
  url.searchParams.set("token_hash", token_hash);
  url.searchParams.set("type", type);
  if (next !== "/" && esRutaInterna(next)) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
/**
 * El click de la persona. Llega como form submit NATIVO desde `/confirmar`
 * (sin JavaScript), así que el cuerpo es `application/x-www-form-urlencoded` y
 * las cookies que escribe `verifyOtp` viajan en el redirect de vuelta.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token_hash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType | "";
  const nextCrudo = String(form.get("next") ?? "");
  const next = esRutaInterna(nextCrudo) ? nextCrudo : "/";
  if (!token_hash || !type) {
    return aAcceso(request, "link_incompleto", type || null);
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (!error) {
    // invite y recovery: el usuario llega logueado pero SIN contraseña.
    // 303 y no el 307 default: después de un POST el redirect tiene que
    // cambiar el método a GET, o el browser reenvía el form al destino.
    if (type === "recovery" || type === "invite") {
      return NextResponse.redirect(new URL("/reset-password", request.url), 303);
    }
    return NextResponse.redirect(new URL(next, request.url), 303);
  }
  return aAcceso(request, motivoDelError(error), type);
}
/**
 * Un link ya usado y uno vencido son el MISMO error para Supabase, y es el
 * caso más frecuente: la invitación se abre dos veces (reenvío, o la persona
 * que vuelve al mail viejo y aprieta el botón de nuevo).
 *
 * Se detecta por texto además de por código porque Supabase no expone un
 * código estable en todas las versiones: llega como `otp_expired` o como
 * "Token has expired or is invalid".
 */
function motivoDelError(error: { code?: string; message?: string }): string {
  const s = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (s.includes("otp_expired") || s.includes("expired or is invalid")) {
    return "link_usado";
  }
  return "verificacion_fallida";
}
/**
 * ¿Es una ruta de ESTA app? `startsWith("/")` solo no alcanza: `//evil.com` es
 * un URL protocol-relative, y `new URL("//evil.com", request.url)` resuelve a
 * `https://evil.com/`. Sin este filtro, un `?next=//evil.com` convierte el
 * link de invitación en un redirect abierto firmado por el dominio del dueño.
 */
function esRutaInterna(valor: string): boolean {
  return valor.startsWith("/") && !valor.startsWith("//");
}
/** `/auth/acceso` explica qué pasó y ofrece la salida (ver esa página). */
function aAcceso(request: NextRequest, motivo: string, flujo: string | null) {
  const url = new URL("/auth/acceso", request.url);
  url.searchParams.set("motivo", motivo);
  if (flujo) url.searchParams.set("flujo", flujo);
  // 303: el `POST` también aterriza acá y el browser tiene que pedirlo con GET.
  return NextResponse.redirect(url, 303);
}
