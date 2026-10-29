// server-only — NO importar desde un archivo con "use client".
/**
 * Server-side authorization guard for mutations. Use it as the first check in
 * API handlers and Server Actions that modify data. Roles and permissions are
 * defined in `lib/auth-helpers.ts`.
 */
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth-helpers";
import { packDeTextos } from "@/lib/beon-idioma";
import { getEffectiveUser } from "@/lib/supabase/helpers";
/**
 * Lo que lee un empleado del dueño en un toast cuando su rol no tiene la
 * acción: sin códigos ni la palabra "403". En el idioma del NEGOCIO, con el
 * mismo mecanismo que `lib/auth-textos.ts`.
 *
 * Kept separate from `lib/auth-textos.ts` because this guard is also used by
 * APIs that do not render authentication screens.
 */
const SIN_PERMISO = packDeTextos({
  es: "No tenés permiso para hacer esto.",
  pt: "Você não tem permissão para fazer isso.",
});
/**
 * `null` = seguí; un texto = no tiene permiso.
 *
 * FAIL CLOSED, y no es negociable: si no se puede leer la sesión (sin las env
 * vars de Supabase `createServerClient()` levanta, y GoTrue puede estar caído)
 * el guard NIEGA. Un `catch` que dejara pasar convertiría una caída de
 * Supabase en "la app queda abierta", que es exactamente el modo de falla que
 * este guard existe para cerrar. El error se loguea: nunca en silencio.
 */
async function rechazo(accion: string): Promise<string | null> {
  let usuario: Awaited<ReturnType<typeof getEffectiveUser>>;
  try {
    usuario = await getEffectiveUser();
  } catch (error) {
    console.error(
      `[guard-autorizacion] no se pudo leer la sesión para "${accion}": se niega`,
      error,
    );
    return SIN_PERMISO;
  }
  if (!usuario || !isAllowed(usuario.role, accion)) {
    return SIN_PERMISO;
  }
  return null;
}
/**
 * Para route handlers. `null` = seguí; una `NextResponse` 403 = cortá y
 * devolvela tal cual. `codigo` es lo que lee la UI; `error` es el texto para
 * cuando se muestra crudo (los moldes lo pasan a `toast.error`).
 */
export async function guardMutacion(
  accion: string,
): Promise<NextResponse | null> {
  const texto = await rechazo(accion);
  if (texto === null) return null;
  return NextResponse.json({ error: texto, codigo: "forbidden" }, { status: 403 });
}
/**
 * Para Server Actions. `null` = seguí; un texto = devolvéselo a la UI.
 *
 * Devuelve el texto en vez de lanzar porque Next, en producción, reemplaza el
 * mensaje de un `throw` dentro de una Server Action por uno genérico con un
 * digest: el empleado vería "An error occurred" en vez de saber que no tiene
 * permiso.
 */
export async function guardAccion(accion: string): Promise<string | null> {
  return rechazo(accion);
}
