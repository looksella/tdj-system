/**
 * ¿El login de este sistema está activo?
 *
 * La plataforma inyecta las variables de Supabase recién cuando el login se
 * activa de verdad (hace falta un plan). Hasta entonces el sistema se sirve
 * ABIERTO a propósito: el middleware horneado deja pasar todo sin las
 * variables, igual que un sistema sin login.
 *
 * Lo que faltaba es que el RESTO de las pantallas no se rompieran mientras
 * tanto. `/admin/usuarios` llamaba a Supabase y devolvía un 500 adentro del
 * sistema del dueño —un ítem del menú que tiraba una pantalla de error de
 * Next—, y `/setup` y `/sign-in` quedaban esperando a un `/api/admin/bootstrap`
 * que tampoco podía contestar. Esta constante es la guarda de las CUATRO:
 * las tres pantallas (`/admin/usuarios`, `/setup`, `/sign-in`) y el helper
 * `getEffectiveUser` de `helpers.ts`, que devuelve al dueño con el login
 * dormido y así es la guarda de todo lo que lee sesión.
 *
 * `NEXT_PUBLIC_*` se inlinea en build time, así que el valor cambia con la
 * publicación siguiente a la activación, nunca en caliente. Es el mismo
 * mecanismo por el que activar el login siempre exige volver a publicar.
 *
 * Es una constante y no una función a propósito: se evalúa igual en el
 * servidor y en el cliente, así que las dos mitades de una pantalla no pueden
 * discrepar.
 */
export const LOGIN_ACTIVO = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
