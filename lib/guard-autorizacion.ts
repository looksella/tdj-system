// server-only — NO importar desde un archivo con "use client".
/**
 * Guard de AUTORIZACIÓN de toda escritura — la versión CON LOGIN.
 *
 * Va como PRIMERA sentencia de cada handler POST/PUT/PATCH/DELETE de una API
 * route y de cada Server Action que escribe:
 *
 *     // route handler
 *     const denegado = await guardMutacion("turnos:crear");
 *     if (denegado) return denegado;
 *
 *     // Server Action
 *     const rechazo = await guardAccion("turnos:crear");
 *     if (rechazo) return { error: rechazo };
 *
 * El nombre de la acción es mecánico, `recurso:verbo`: el recurso son los
 * segmentos de `app/api/` sin los dinámicos, unidos por `.`, y el verbo es
 * `crear` (POST), `editar` (PUT/PATCH) o `eliminar` (DELETE). Qué rol puede
 * cada acción lo dice `PERMISSIONS` en `lib/auth-helpers.ts`.
 *
 * ── Por qué este archivo tiene DOS versiones ────────────────────────────────
 *
 * La que estás leyendo es la del OVERLAY DE AUTH, y es la que NIEGA. El andamio
 * trae una versión PERMISIVA con la misma firma (sin login no hay sesión ni
 * roles: cualquiera con el link ya está adentro, que es el diseño de esa
 * entrega), y este archivo la PISA cuando la plataforma hornea el login: es
 * plomería en el manifiesto del overlay. Ese pisado es el mecanismo, no un
 * accidente.
 *
 * La indirección existe porque el login es un built-in condicional: sin él,
 * `lib/supabase/helpers.ts` y `lib/auth-helpers.ts` no existen, y un import a
 * un archivo inexistente no degrada, rompe el `npm run build` de la app entera.
 * El único archivo que conoce la auth es este.
 *
 * ── Qué agrega sobre el middleware ──────────────────────────────────────────
 *
 * El middleware separa anónimo de autenticado y nada más: no separa un rol de
 * otro, y en el sandbox del dueño (`BEON_SANDBOX_DEV`) ni siquiera corre. Este
 * guard es el que pregunta el ROL. Ocultar un botón NO es un control de acceso.
 *
 * `getEffectiveUser()` ya trae el bypass del sandbox: en el preview del dueño
 * devuelve el admin sintético y el guard deja pasar.
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
 * Vive ACÁ y no en `lib/auth-textos.ts` a propósito: la plataforma escribe
 * este archivo también en sistemas que nacieron con un molde anterior (en el
 * motor, antes de que el agente arranque), y el `auth-textos.ts` de esos
 * sistemas no trae ninguna clave nueva. Leer una clave que no existe ahí no
 * degrada: rompe el `npm run build` de la app entera.
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
