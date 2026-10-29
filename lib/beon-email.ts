// Optional server-side email client for the configured BEON Tools service.
export interface SendEmailInput {
  /** Uno o varios destinatarios (máximo 5 por envío). */
  to: string | string[];
  subject: string;
  /** Cuerpo HTML. Si no mandás `text`, se deriva uno plano. */
  html: string;
  /** Cuerpo de texto plano opcional (fallback para clientes sin HTML). */
  text?: string;
  /** A quién le llega la respuesta. Default: el mail del dueño del sistema. */
  replyTo?: string;
}
export interface SendEmailResult {
  id: string | null;
  /** Monthly email usage returned by the mail service. */
  usage: { sent_this_month: number; free_monthly: number };
}
/**
 * Manda un email desde el sistema. Server-side only (Server Action o Route
 * Handler): nunca desde un componente `"use client"`.
 *
 * Errores que conviene mostrarle al usuario tal cual:
 *  - 402: el servicio de correo no tiene saldo disponible.
 *  - 429: se alcanzó el tope diario de emails (anti-spam).
 *  - 503: el envío de emails no está habilitado para este sistema.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Env vars leídas al llamar, no al cargar el módulo (App Router las resuelve
  // por request; a nivel módulo pueden ser undefined).
  const TOOLS_URL = process.env.BEON_TOOLS_URL;
  const TOOLS_KEY = process.env.BEON_TOOLS_API_KEY;
  if (!TOOLS_URL || !TOOLS_KEY) throw new Error("Beon Tools no configurado para este proyecto.");
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const res = await fetch(`${TOOLS_URL}/v1/email/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOOLS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  if (res.status === 402) throw new Error("El servicio de correo no tiene saldo disponible.");
  if (res.status === 429) {
    // Distinguish the per-system cap from the provider-wide cap.
    let code = "";
    try {
      const body = (await res.json()) as { detail?: { error?: string } };
      code = body?.detail?.error ?? "";
    } catch {
      // sin body legible cae al mensaje del tope del sistema
    }
    throw new Error(
      code === "platform_email_cap_reached"
        ? "El proveedor de correo alcanzó su límite diario. Se reanuda mañana."
        : "Este sistema alcanzó el tope diario de emails. Se reanuda mañana.",
    );
  }
  if (res.status === 422) {
    let msg = "";
    try {
      const body = (await res.json()) as { detail?: { message?: string } };
      msg = body?.detail?.message ?? "";
    } catch {
      // sin detalle, mensaje genérico
    }
    throw new Error(msg || "Algún destinatario no recibe más emails de este sistema (rebotó, marcó spam o se dio de baja).");
  }
  if (res.status === 503) throw new Error("El envío de emails no está habilitado para este sistema.");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Beon Email ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}
