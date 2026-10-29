// Optional server-side client for external BEON Tools services.
export interface ToolResponse<T = any> {
  result: T;
  usage: { tool: string; operation: string; cost_usd: number; balance_remaining_usd: number };
}
// Content block types for multimedia messages (PDFs, images).
// Use plain string for text-only messages — content blocks only for files/media.
export type TextBlock = { type: "text"; text: string };
export type DocumentBlock = { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
export type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export type ContentBlock = TextBlock | DocumentBlock | ImageBlock;
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentBlock[] };
async function callTool<T = any>(tool: string, operation: string, params: Record<string, any> = {}): Promise<ToolResponse<T>> {
  // Read env vars at call time — NOT at module top-level.
  // Next.js App Router resolves server-only env vars at request time;
  // reading them at module load can return undefined and silently break the client.
  const TOOLS_URL = process.env.BEON_TOOLS_URL;
  const TOOLS_KEY = process.env.BEON_TOOLS_API_KEY;
  if (!TOOLS_URL || !TOOLS_KEY) throw new Error("Beon Tools no configurado para este proyecto.");
  const res = await fetch(`${TOOLS_URL}/v1/${tool}/${operation}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOOLS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (res.status === 402) throw new Error("El servicio externo no tiene saldo disponible.");
  if (res.status === 429) throw new Error("Demasiadas solicitudes. Esperá unos segundos.");
  if (!res.ok) {
    // Superficie del error real (status + detalle del proxy) para que el
    // caller pueda loguearlo — nunca tragarse el motivo del fallo.
    const detail = await res.text().catch(() => "");
    throw new Error(`Beon Tools ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}
export const beonTools = {
  ai: {
    // chat() returns Promise<string> — the text content directly.
    // jsonSchema: pass a JSON Schema to GUARANTEE the response matches it (no prose, correct types).
    //   This is the reliable way to get structured JSON — prefer it over prompting for extraction.
    // thinking: true enables extended reasoning (slower, more accurate for complex extraction).
    chat: (opts: {
      messages: ChatMessage[];
      model?: string;
      maxTokens?: number;
      temperature?: number;
      jsonSchema?: Record<string, unknown>;
      thinking?: boolean;
      thinkingBudgetTokens?: number;
      stopSequences?: string[];
    }) =>
      callTool("ai", "chat_completion", {
        messages: opts.messages,
        model: opts.model ?? "claude-sonnet",
        max_tokens: opts.maxTokens ?? 64000,
        ...(opts.temperature !== undefined && { temperature: opts.temperature }),
        ...(opts.jsonSchema && { json_schema: opts.jsonSchema }),
        ...(opts.thinking && { thinking: true, thinking_budget_tokens: opts.thinkingBudgetTokens ?? 8000 }),
        ...(opts.stopSequences && { stop_sequences: opts.stopSequences }),
      })
        .then((r: ToolResponse) => {
          const d = (r.result ?? (r as any).data ?? r) as Record<string, unknown>;
          const choices = d.choices as Array<{ message?: { content?: string } }> | undefined;
          const text = choices?.[0]?.message?.content ?? (d.text as string) ?? "";
          if (!text) throw new Error("Beon AI returned an empty response.");
          return text;
        }),
  },
  afip: {
    createVoucher: (params: { tipo_cbte: number; concepto?: number; doc_tipo?: number; doc_nro?: string; items: any[]; total_esperado?: number }) =>
      callTool("afip", "create_voucher", params),
    lastVoucher: (params: { tipo_cbte: number }) =>
      callTool("afip", "last_voucher", params),
    consultVoucher: (params: { tipo_cbte: number; cbte_nro: number }) =>
      callTool("afip", "consult_voucher", params),
    serverStatus: () =>
      callTool("afip", "server_status", {}),
    // Padrón de ARCA del RECEPTOR (el cliente al que se le factura): razón
    // social y condición de IVA para autocompletar el formulario de emisión.
    // No requiere config ni delegación del emisor. `result.found === false`
    // significa "no se obtuvieron datos para ese CUIT", nunca una caída del
    // padrón: eso llega como error HTTP.
    consultTaxpayer: (params: { cuit: string }) =>
      callTool("afip", "consult_taxpayer", params),
  },
};
