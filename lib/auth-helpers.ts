/**
 * Permisos del negocio. El bloque de roles lo genera TuSistema desde lo que el
 * dueño describió en el wizard; el mecanismo (`isAllowed`) es fijo.
 *
 * Los roles viven en `user.app_metadata.role` (persisten en `auth.users`) y
 * los lee `getEffectiveUser()` en `lib/supabase/helpers.ts`.
 *
 * NUNCA en `user_metadata`: ese campo lo reescribe el propio usuario desde el
 * browser (`supabase.auth.updateUser({ data: { role: "admin" } })` con la anon
 * key pública), así que un rol guardado ahí no es un permiso, es un pedido.
 * `app_metadata` solo se escribe con la service role key, server-side.
 *
 * Cómo se escribe, según el camino:
 * - `auth.admin.createUser({ ..., app_metadata: { role } })` — el único que lo
 *   acepta en una sola llamada (es el bootstrap del primer admin).
 * - Invitaciones (`inviteUserByEmail`, `generateLink`): NO aceptan
 *   `app_metadata`; su opción `data` escribe `user_metadata`. Van en DOS
 *   pasos — invitar sin rol y, con el `id` devuelto,
 *   `auth.admin.updateUserById(id, { app_metadata: { role },
 *   user_metadata: { role: null } })`. Si el segundo paso falla, se revierte
 *   la invitación: nunca un usuario a medio crear.
 */
/* @tusistema:APP_ROLES:start */
export type AppRole = "admin";
/**
 * Qué puede hacer cada rol. `"*"` es wildcard (el dueño).
 * Un rol que no esté acá no puede hacer nada — fail closed.
 */
const PERMISSIONS: Record<AppRole, Set<string>> = {
  // Dueño — ve y modifica todo.
  admin: new Set(["*"]),
};
/* @tusistema:APP_ROLES:end */
/**
 * Único chequeo de permisos de la app. Fail closed: sin rol, o con un rol que
 * no está en PERMISSIONS, devuelve false.
 *
 * Usalo en TODA acción mutante, del lado del servidor:
 *
 *   const user = await getEffectiveUser();
 *   if (!user || !isAllowed(user.role, "ventas:crear")) {
 *     return new Response("Forbidden", { status: 403 });
 *   }
 *
 * En la UI, ocultá o deshabilitá según el rol pasándolo por props desde un
 * Server Component. Ocultar un botón NO es un control de acceso: el chequeo
 * del servidor es el que cuenta.
 */
export function isAllowed(role: string | null | undefined, action: string): boolean {
  if (!role) return false;
  const perms = PERMISSIONS[role as AppRole];
  if (!perms) return false;
  return perms.has("*") || perms.has(action);
}
/** Los roles configurados, para poblar selects de invitación. */
export const APP_ROLES = Object.keys(PERMISSIONS) as AppRole[];
