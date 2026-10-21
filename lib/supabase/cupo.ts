import { at } from "@/lib/auth-textos";
/**
 * ¿Este sistema puede sumar a alguien más? Lo contesta la plataforma.
 *
 * SPEC_LLAVE_GRATIS_PARA_TODOS Bloque 5. El login es gratis para todos, pero
 * sin plan entra una sola persona: el dueño. Ese tope no puede vivir solo en
 * TuSistema, porque `/admin/usuarios` invita con la service role key y no pasa
 * por la plataforma: sin esta pregunta, el tope se salteaba desde adentro de
 * la app. La regla vive en la plataforma (`GET /tools/v1/auth/cupo`); acá solo
 * se pregunta.
 *
 * Plomería: se pisa siempre (la versión canónica gana). Solo server-side: usa
 * `BEON_TOOLS_API_KEY`, que nunca puede llegar al bundle del cliente.
 */
export type ResultadoCupo = { puedeInvitar: boolean } | { error: "sin_verificar" };
/**
 * Le pregunta a la plataforma si hay lugar para una persona más.
 *
 * Nunca lanza. Sin las variables de la plataforma, con un error de red, una
 * respuesta que no es 200, una que no se entiende o un timeout corto, devuelve
 * `sin_verificar`: el caller NO invita. Invitar sin respuesta le regalaría el
 * equipo a quien no tiene plan; no invitar es un "probá de nuevo".
 */
export async function consultarCupo(): Promise<ResultadoCupo> {
  // Env vars leídas al llamar, no al cargar el módulo (App Router las resuelve
  // por request; a nivel módulo pueden ser undefined).
  const url = process.env.BEON_TOOLS_URL;
  const key = process.env.BEON_TOOLS_API_KEY;
  if (!url || !key) return { error: "sin_verificar" };
  try {
    const res = await fetch(`${url}/v1/auth/cupo`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: "sin_verificar" };
    const body = await res.json();
    if (typeof body?.puede_invitar !== "boolean") return { error: "sin_verificar" };
    return { puedeInvitar: body.puede_invitar };
  } catch {
    return { error: "sin_verificar" };
  }
}
/**
 * La respuesta que corta una invitación, o `null` si hay lugar.
 *
 * La comparten el alta (`/api/admin/usuarios`) y el link copiable
 * (`/api/admin/usuarios/invite-link`): dos caminos al mismo resultado, una
 * sola regla. Sin verificar, 503; sin lugar, 402 con el texto que le dice al
 * admin que el dueño necesita un plan. Los dos con `code`, para que quien
 * consuma la ruta distinga por código y no por texto.
 */
export async function rechazoPorCupo(): Promise<Response | null> {
  const cupo = await consultarCupo();
  if ("error" in cupo) {
    return Response.json(
      { error: at.api.cupoSinVerificar, code: "cupo_sin_verificar" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!cupo.puedeInvitar) {
    return Response.json(
      { error: at.api.planRequerido, code: "plan_required_for_team" },
      { status: 402, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}
