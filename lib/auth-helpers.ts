/**
 * Permisos de la aplicación.
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
 * - `auth.admin.createUser({ ..., app_metadata: { role } })` — lo asigna al
 *   crear el primer administrador.
 * - Invitaciones (`inviteUserByEmail`, `generateLink`): NO aceptan
 *   `app_metadata`; su opción `data` escribe `user_metadata`. Van en DOS
 *   pasos — invitar sin rol y, con el `id` devuelto,
 *   `auth.admin.updateUserById(id, { app_metadata: { role },
 *   user_metadata: { role: null } })`. Si el segundo paso falla, se revierte
 *   la invitación: nunca un usuario a medio crear.
 */
export type AppRole = "developer" | "admin" | "employee";
/**
 * Qué puede hacer cada rol. `"*"` es wildcard.
 * Un rol que no esté acá no puede hacer nada — fail closed.
 */
const PERMISSIONS: Record<AppRole, Set<string>> = {
  developer: new Set(["*"]),
  admin: new Set(["*"]),
  employee: new Set([
    "inventory:read",
    "pos:read",
    "sales:create",
    // Turno: lo que hace el equipo en el mostrador.
    "cash:operate",
    "attendance:punch",
  ]),
};

/**
 * Herramientas del turno y quién puede entrar a cada una.
 *
 * Vive acá y no en cada pantalla para que el menú, la guarda de la página y
 * las Server Actions hablen del mismo permiso. Lo que el empleado NO tiene
 * (`payroll:manage`, `team:manage`, `attendance:manage`) es la frontera entre
 * "mi turno" y "la nómina del negocio".
 */
export const PERMISOS_TURNO = {
  caja: "cash:operate",
  asistencia: "attendance:punch",
  planilla: "payroll:manage",
  gestionEquipo: "team:manage",
  corregirMarcajes: "attendance:manage",
} as const;
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
/** Developer is reserved for the local bootstrap command, never invitations. */
export const INVITABLE_ROLES = ["admin", "employee"] as const;
