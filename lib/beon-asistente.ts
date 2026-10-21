// ============================================================
// PLATFORM FILE — lib/beon-asistente.ts
// Generado e inyectado por TuSistema. NO editar ni reescribir.
// Es el cliente del módulo "Asistente IA": habla con el proxy de
// la plataforma con el token del proyecto, así que la app no
// tiene ninguna API key ni acceso directo a la IA. La consulta a
// la base la resuelve la plataforma en modo SOLO LECTURA — desde
// acá no se puede escribir nada.
// ============================================================
export type AsistenteKind = "data" | "system" | "derived";
export type AsistenteRespuesta =
  | {
      ok: true;
      answer: string | null;
      kind: AsistenteKind;
      derived: string | null;
      tablesUsed: string[];
      rowCount: number;
      truncated: boolean;
      empty: boolean;
    }
  | {
      ok: false;
      code:
        | "insufficient_credits"
        | "daily_ai_cap_reached"
        | "disabled"
        | "not_published"
        | "error";
      message: string;
      creditsUrl?: string;
    };
export interface AsistenteConfig {
  enabled: boolean;
  suggestedQuestions: string[];
  creditsPerQuestionHint: string;
  ownerHasCredits: boolean;
}
const CREDITS_URL = "https://tusistema.ai/creditos";
/** Env vars leídas al llamar, no al cargar el módulo: el App Router las
 *  resuelve por request y a nivel módulo pueden ser undefined. */
function proxy(): { url: string; key: string } | null {
  const url = process.env.BEON_TOOLS_URL;
  const key = process.env.BEON_TOOLS_API_KEY;
  if (!url || !key) return null;
  return { url, key };
}
/**
 * Una pregunta del dueño. Server-side only (Route Handler o Server Action).
 *
 * Nunca levanta: los errores que el dueño tiene que ver vuelven como
 * `{ ok: false, code }` para que la página muestre un mensaje humano en vez de
 * una pantalla rota.
 */
export async function preguntar(input: {
  question: string;
  env: "sandbox" | "production";
  locale: "es" | "pt";
}): Promise<AsistenteRespuesta> {
  const p = proxy();
  if (!p) {
    return { ok: false, code: "disabled", message: "El asistente no está configurado en este sistema." };
  }
  let res: Response;
  try {
    res = await fetch(`${p.url}/v1/assistant/ask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "error", message: "No pudimos consultar tu sistema. Probá de nuevo en un momento." };
  }
  if (res.status === 402) {
    return {
      ok: false,
      code: "insufficient_credits",
      message: "El dueño del sistema se quedó sin créditos en TuSistema.",
      creditsUrl: CREDITS_URL,
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      code: "daily_ai_cap_reached",
      message: "Este sistema llegó al tope diario de IA. Se reanuda mañana.",
    };
  }
  if (res.status === 404 || res.status === 409) {
    return { ok: false, code: "disabled", message: "El asistente está desactivado." };
  }
  if (!res.ok) {
    return { ok: false, code: "error", message: "No pudimos consultar tu sistema. Probá de nuevo en un momento." };
  }
  let body: { result?: Record<string, unknown> };
  try {
    body = (await res.json()) as { result?: Record<string, unknown> };
  } catch {
    return { ok: false, code: "error", message: "No pudimos consultar tu sistema. Probá de nuevo en un momento." };
  }
  const r = body.result ?? {};
  const derived = (r.derived as string | null) ?? null;
  if (derived === "not_published") {
    return {
      ok: false,
      code: "not_published",
      message: "Todavía no publicaste este sistema, así que no hay datos de producción que consultar.",
    };
  }
  return {
    ok: true,
    answer: (r.answer as string | null) ?? null,
    kind: ((r.kind as AsistenteKind) ?? "derived"),
    derived,
    tablesUsed: (r.tables_used as string[]) ?? [],
    rowCount: (r.row_count as number) ?? 0,
    truncated: Boolean(r.truncated),
    empty: Boolean(r.empty),
  };
}
/**
 * Estado del módulo: si se muestra, las preguntas de ejemplo, y si el dueño
 * tiene créditos. NO depende del saldo a propósito — un dueño sin créditos
 * tiene que ver el módulo y el aviso, no una sección que desapareció.
 */
export async function configuracion(): Promise<AsistenteConfig> {
  const apagado: AsistenteConfig = {
    enabled: false,
    suggestedQuestions: [],
    creditsPerQuestionHint: "",
    ownerHasCredits: false,
  };
  const p = proxy();
  if (!p) return apagado;
  try {
    const res = await fetch(`${p.url}/v1/assistant/config`, {
      headers: { Authorization: `Bearer ${p.key}` },
      cache: "no-store",
    });
    if (!res.ok) return apagado;
    const body = (await res.json()) as {
      enabled?: boolean;
      suggested_questions?: string[];
      credits_per_question_hint?: string;
      owner_has_credits?: boolean;
    };
    return {
      enabled: Boolean(body.enabled),
      suggestedQuestions: body.suggested_questions ?? [],
      creditsPerQuestionHint: body.credits_per_question_hint ?? "",
      ownerHasCredits: Boolean(body.owner_has_credits),
    };
  } catch {
    return apagado;
  }
}
/**
 * Genera las 3 preguntas de ejemplo contra ESTE sistema (su schema y su
 * manual). Es gratis para el dueño y la plataforma la cachea por versión, así
 * que llamarla de más no cuesta ni una llamada al modelo.
 *
 * Nunca levanta: sin sugerencias la página se dibuja igual, sin chips.
 */
export async function generarSugerencias(
  env: "sandbox" | "production",
  locale: "es" | "pt",
): Promise<string[]> {
  const p = proxy();
  if (!p) return [];
  try {
    const res = await fetch(`${p.url}/v1/assistant/suggestions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ env, locale }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      result?: { suggested_questions?: string[] };
    };
    return body.result?.suggested_questions ?? [];
  } catch {
    return [];
  }
}
/** `sandbox` mientras el dueño itera en el chat; `production` una vez publicado. */
export function entornoActual(): "sandbox" | "production" {
  return process.env.BEON_SANDBOX_DEV === "1" ? "sandbox" : "production";
}
