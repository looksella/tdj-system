// server-only — NO importar desde un archivo con "use client".
import { createServerClient } from "./server";
import { LOGIN_ACTIVO } from "./estado";
/**
 * Sandbox de prueba de TuSistema. Server-only, NUNCA con prefijo
 * `NEXT_PUBLIC_`: con el prefijo queda en el bundle del cliente y se filtra a
 * producción, o sea que cualquiera podría bypassear la auth.
 */
const IS_SANDBOX_DEV = process.env.BEON_SANDBOX_DEV === "1";
/**
 * El sistema se sirve ABIERTO porque el plan del dueño terminó: el middleware
 * ya deja pasar a todos, y acá todos son el dueño. Es el mismo comportamiento
 * del login dormido, por una segunda puerta. Server-only, sin
 * `NEXT_PUBLIC_`.
 */
const AUTH_ABIERTO = process.env.BEON_AUTH_MODE === "open";
export type EffectiveUser = {
  id: string;
  email: string;
  role: string;
};
/**
 * Dueño sintético: quien "está logueado" cuando no hay sesión que leer.
 * Dos estados lo producen, y los dos significan lo mismo —la app se sirve
 * ABIERTA—: el sandbox de prueba y el login dormido (app publicada sin plan,
 * cuyo middleware horneado deja pasar a todos).
 */
function duenioSintetico(id: string, email: string): EffectiveUser {
  return { id, email, role: "admin" };
}
/**
 * ÚNICA lectura de sesión server-side de toda la app. Path y nombre fijos:
 * es contrato con la plataforma.
 *
 * NUNCA llames `supabase.auth.getUser()` inline en una page o route: el sandbox
 * de prueba bypasea la auth y sin ese bypass el preview del dueño responde con
 * `user: null`. Pasó de verdad (2026-08-13): un helper propio sin bypass dejó
 * las pantallas protegidas en 401 dentro del preview.
 *
 * Siempre `getUser()`, nunca `getSession()`: `getUser()` verifica el JWT contra
 * Supabase, `getSession()` solo lee la cookie local y se la puede falsear.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  // 1. Sandbox: el único bypass que ignora el entorno. Va PRIMERO porque con
  //    storage activo el sandbox recibe NEXT_PUBLIC_SUPABASE_URL sin anon key
  //    y LOGIN_ACTIVO mentiría.
  if (IS_SANDBOX_DEV) {
    // El email lo inyecta la plataforma. No lo hardcodees: un
    // "sandbox@example.com" en pantalla se lee como un bug.
    return duenioSintetico(
      "sandbox-owner",
      process.env.BEON_SANDBOX_OWNER_EMAIL ?? "duenio@tusistema.ai",
    );
  }
  // 2. Login dormido: la plataforma publicó la app ABIERTA (sin plan). El
  //    middleware ya deja pasar a todos; acá todos son el dueño. Sin esto, la
  //    primera línea de cualquier ruta que lea sesión tira en producción
  //    (agendapet-05d9, 2026-09-19). Sin email a propósito: la app es pública.
  //
  //    `AUTH_ABIERTO` es la segunda puerta al MISMO estado: el sistema tiene
  //    las variables de Supabase (sus usuarios siguen ahí, guardados) pero el
  //    plan terminó, así que se sirve abierto hasta que el dueño vuelva.
  if (!LOGIN_ACTIVO || AUTH_ABIERTO) return duenioSintetico("owner", "");
  // 3. Supabase real.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    // El role del negocio vive en `app_metadata.role`, NUNCA en
    // `user_metadata`: ese último lo reescribe el propio usuario con su sesión
    // y la anon key pública (`supabase.auth.updateUser({ data: { role } })` =
    // PUT /auth/v1/user), así que cualquier autenticado se ascendía a admin en
    // dos requests. `app_metadata` solo se escribe con la service role key.
    //
    // SIN fallback a `user_metadata` a propósito: el fallback reabre el
    // agujero entero (alcanza con que el atacante NO tenga rol en
    // `app_metadata` para que se lea el que él mismo escribió).
    //
    // El default es el rol menos privilegiado, también a propósito: `isAllowed`
    // no le da permisos a un role que no esté en PERMISSIONS, así que una
    // cuenta sin metadata queda sin poder hacer nada en vez de heredar los
    // permisos del dueño.
    role: (user.app_metadata?.role as string | undefined) ?? "customer",
  };
}
