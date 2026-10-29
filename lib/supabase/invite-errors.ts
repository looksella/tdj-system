/**
 * Traducción de los errores crudos de Supabase Auth a mensajes que el dueño
 * puede accionar. El error crudo NUNCA se muestra en la UI: dice
 * "over_email_send_rate_limit" donde el dueño necesita leer "generá un link".
 *
 * Los mensajes salen de `lib/auth-textos.ts`, no de acá: este mapa decide QUÉ
 * error es, y el pack en qué idioma se lee. Duplicar el mapa por idioma haría
 * que una rama nueva se agregue en uno y se olvide en el otro.
 */
import { at } from "@/lib/auth-textos";
/**
 * El tope de mails por hora que Supabase aplica sobre el proyecto.
 *
 * Se detecta por el TEXTO porque Supabase no expone un código estable para
 * este caso: llega como `over_email_send_rate_limit`, como "email rate limit"
 * o como "For security purposes..." según el endpoint y la versión.
 */
export function isSupabaseRateLimit(raw: string): boolean {
  const s = raw ?? "";
  return (
    s.includes("over_email_send_rate_limit") ||
    s.includes("email rate limit") ||
    s.includes("For security purposes")
  );
}
/**
 * Quién está leyendo el error.
 *
 * El mismo error de Supabase se acciona distinto según de qué lado del
 * mostrador está la persona: el dueño invitando desde /admin/usuarios puede
 * generar un link y mandarlo él; el cliente que se registra en /sign-up no
 * puede hacer nada más que esperar, y lo peor que se le puede decir es que
 * revise sus datos (están bien).
 */
export type ContextoAuthError = "registro" | "invitacion";
/**
 * Los motivos de un `weak_password` de GoTrue (`length` | `characters` |
 * `pwned`), o `undefined` si el error no los trae. supabase-js los pone en
 * `AuthWeakPasswordError.reasons`; se leen por forma y no con
 * `isAuthWeakPasswordError` para que este archivo no dependa de la versión de
 * supabase-js de cada app.
 */
export function motivosDeContrasena(error: unknown): readonly string[] | undefined {
  if (typeof error !== "object" || error === null || !("reasons" in error)) {
    return undefined;
  }
  const motivos = error.reasons;
  return Array.isArray(motivos) && motivos.every((m) => typeof m === "string")
    ? motivos
    : undefined;
}
/**
 * Solo `pwned` es "filtrada": las pantallas ya chequearon el largo y los
 * caracteres antes de llamar. Cualquier otro motivo, o ninguno (una pantalla
 * vieja que no los pasa), es la regla entera de `passwordDebil`.
 */
export function esContrasenaFiltrada(motivos: readonly string[] | undefined): boolean {
  return !!motivos && motivos.length > 0 && motivos.every((m) => m === "pwned");
}
function textoDeContrasenaRechazada(motivos: readonly string[] | undefined): string {
  return esContrasenaFiltrada(motivos)
    ? at.errores.passwordFiltrada
    : at.errores.passwordDebil;
}
/**
 * Mensaje accionable, según el contexto. El ORDEN de los casos importa: el
 * rate limit se evalúa primero porque su mensaje crudo también puede contener
 * otras palabras clave.
 */
export function mapSupabaseAuthError(
  raw: string,
  contexto: ContextoAuthError,
  code?: string,
  motivos?: readonly string[],
): string {
  const s = raw ?? "";
  // `weak_password` es un código estable de GoTrue (422): se decide por él,
  // no por el texto en inglés que lo acompaña.
  if (code === "weak_password") {
    return textoDeContrasenaRechazada(motivos);
  }
  if (isSupabaseRateLimit(s)) {
    return contexto === "registro"
      ? at.errores.rateLimitRegistro
      : at.errores.rateLimit;
  }
  if (s.includes("already registered") || s.includes("already been registered")) {
    return at.errores.yaRegistrado;
  }
  if (s.toLowerCase().includes("invalid email")) {
    return at.errores.emailInvalido;
  }
  return at.errores.invitacionGenerico;
}
/** Alias histórico: los callers de la gestión de usuarios no se tocan. */
export function mapSupabaseInviteError(raw: string): string {
  return mapSupabaseAuthError(raw, "invitacion");
}
/**
 * Minimum password length checked before sending a password to Supabase Auth.
 */
export const PASSWORD_MIN_LENGTH = 8;
/**
 * Chequeo local ANTES de llamar a Supabase: sin él, el dueño escribe una
 * contraseña que la pantalla acepta, GoTrue la rechaza y el error llega en
 * inglés. "Filtrada" (`pwned`) no se puede chequear acá: si GoTrue la rechaza
 * por eso, llega `weak_password` y se mapea al mismo texto.
 */
export function passwordCumple(p: string): boolean {
  return p.length >= PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(p) && /\d/.test(p);
}
/**
 * Error de `signInWithPassword` / `updateUser` a texto del pack. Decide por el
 * `code` de GoTrue, nunca por el mensaje: el rechazo por intentos fallidos
 * llega como `invalid_credentials`, el mismo código que una contraseña mala, y
 * por eso `credencialesInvalidas` cubre los dos casos. `raw` se recibe para
 * que el call site no tenga que elegir qué pasar, pero no decide nada.
 */
export function mapSupabaseLoginError(raw: string, code?: string): string {
  void raw;
  switch (code) {
    case "weak_password":
      return at.errores.passwordDebil;
    case "invalid_credentials":
      return at.errores.credencialesInvalidas;
    case "email_not_confirmed":
      return at.errores.emailSinConfirmar;
    default:
      return at.errores.loginGenerico;
  }
}
/**
 * Error de `updateUser({ password })` en `/reset-password`. No comparte mapa
 * con el login: un fallo al guardar la contraseña nueva no es "no se pudo
 * iniciar sesión". Decide por el `code` de GoTrue, nunca por el texto.
 */
export function mapSupabaseResetError(
  raw: string,
  code?: string,
  motivos?: readonly string[],
): string {
  void raw;
  switch (code) {
    case "weak_password":
      return textoDeContrasenaRechazada(motivos);
    case "same_password":
      return at.errores.passwordIgual;
    default:
      return at.reset.errorGenerico;
  }
}
