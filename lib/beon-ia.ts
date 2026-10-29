export type TipoCampo = "texto" | "numero" | "fecha" | "moneda" | "lista";
export interface Campo {
  /** Nombre de la clave en el objeto de salida. Usá el nombre real de tu columna. */
  nombre: string;
  /** Cómo se le muestra al usuario en el formulario de revisión. */
  etiqueta: string;
  tipo: TipoCampo;
  /** Opcional: qué es este campo, para que la lectura no se confunda. */
  descripcion?: string;
  /** Solo para `tipo: "lista"`: los campos de cada fila (ítems de una factura). */
  items?: Campo[];
}
export interface ArchivoEntrada {
  nombre: string;
  /** `image/jpeg`, `image/png`, `image/webp`, `image/gif` o `application/pdf`. */
  tipo: string;
  /** Contenido en base64, SIN el prefijo `data:...;base64,`. */
  base64: string;
}
export type ErrorIA =
  | "insufficient_credits"
  | "daily_ai_cap_reached"
  | "archivo_ilegible"
  | "error";
export type ResultadoExtraccion =
  | {
      ok: true;
      /** Los campos leídos, con las claves de `campos[].nombre`. */
      datos: Record<string, unknown>;
      confianza: "alta" | "media" | "baja";
      /** Inconsistencias que la lectura notó ("el total no coincide con la suma de ítems"). */
      observaciones: string[];
    }
  | { ok: false; code: ErrorIA; message: string };
export type ResultadoPregunta =
  | { ok: true; texto?: string; datos?: unknown }
  | { ok: false; code: ErrorIA; message: string };
/** Tope por archivo. Vercel corta el body de una función en 4,5 MB. */
export const MAX_BYTES_POR_ARCHIVO = 4 * 1024 * 1024;
export const MAX_ARCHIVOS = 3;
const TIPOS_ACEPTADOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
/** Env vars leídas al llamar, no al cargar el módulo: el App Router las
 *  resuelve por request y a nivel módulo pueden ser undefined. */
function proxy(): { url: string; key: string } | null {
  const url = process.env.BEON_TOOLS_URL;
  const key = process.env.BEON_TOOLS_API_KEY;
  if (!url || !key) return null;
  return { url, key };
}
/** `sandbox` mientras el dueño itera en el chat; `production` una vez publicado. */
export function entornoActual(): "sandbox" | "production" {
  return process.env.BEON_SANDBOX_DEV === "1" ? "sandbox" : "production";
}
type BloqueTexto = { type: "text"; text: string };
type BloqueImagen = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
type BloqueDocumento = {
  type: "document";
  source: { type: "base64"; media_type: "application/pdf"; data: string };
};
type Bloque = BloqueTexto | BloqueImagen | BloqueDocumento;
function bloquesDeArchivos(archivos: ArchivoEntrada[]): Bloque[] {
  return archivos.map((a) =>
    a.tipo === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: a.base64 },
        } as BloqueDocumento)
      : ({
          type: "image",
          source: { type: "base64", media_type: a.tipo, data: a.base64 },
        } as BloqueImagen),
  );
}
/**
 * Valida los archivos antes de gastar una llamada. Devuelve el motivo en
 * castellano o `null` si están bien.
 */
export function validarArchivos(archivos: ArchivoEntrada[]): string | null {
  if (!archivos.length) return "No adjuntaste ningún archivo.";
  if (archivos.length > MAX_ARCHIVOS) {
    return `Podés subir hasta ${MAX_ARCHIVOS} archivos por vez.`;
  }
  for (const a of archivos) {
    if (!TIPOS_ACEPTADOS.includes(a.tipo)) {
      return `"${a.nombre}" no es una foto ni un PDF.`;
    }
    // base64 pesa 4/3 del binario.
    const bytes = Math.floor((a.base64.length * 3) / 4);
    if (bytes > MAX_BYTES_POR_ARCHIVO) {
      return `"${a.nombre}" pesa más de 4 MB. Sacale una foto con menos resolución o subí un PDF más liviano.`;
    }
  }
  return null;
}
function schemaDeCampo(c: Campo): Record<string, unknown> {
  const base: Record<string, unknown> = c.descripcion ? { description: c.descripcion } : {};
  switch (c.tipo) {
    case "numero":
    case "moneda":
      return { ...base, type: "number" };
    case "fecha":
      return {
        ...base,
        type: "string",
        description: `${c.descripcion ? c.descripcion + ". " : ""}Formato ISO: AAAA-MM-DD.`,
      };
    case "lista": {
      const propiedades: Record<string, unknown> = {};
      for (const hijo of c.items ?? []) propiedades[hijo.nombre] = schemaDeCampo(hijo);
      return {
        ...base,
        type: "array",
        items: { type: "object", properties: propiedades },
      };
    }
    default:
      return { ...base, type: "string" };
  }
}
function schemaDeExtraccion(campos: Campo[]): Record<string, unknown> {
  const propiedades: Record<string, unknown> = {};
  for (const c of campos) propiedades[c.nombre] = schemaDeCampo(c);
  return {
    type: "object",
    properties: {
      datos: {
        type: "object",
        description:
          "Los campos leídos del archivo. Omití una clave si el dato no está en el archivo: no inventes valores.",
        properties: propiedades,
      },
      confianza: {
        type: "string",
        enum: ["alta", "media", "baja"],
        description: "Qué tan legible era el archivo y qué tan seguro estás de los valores.",
      },
      observaciones: {
        type: "array",
        items: { type: "string" },
        description:
          "Inconsistencias o dudas, en castellano y en una línea cada una. Vacío si no hay ninguna.",
      },
    },
    required: ["datos", "confianza", "observaciones"],
  };
}
function descripcionDeCampos(campos: Campo[], sangria = ""): string {
  return campos
    .map((c) => {
      const detalle = c.descripcion ? `: ${c.descripcion}` : "";
      const linea = `${sangria}- ${c.nombre} (${c.etiqueta}, ${c.tipo})${detalle}`;
      return c.tipo === "lista" && c.items?.length
        ? `${linea}\n${descripcionDeCampos(c.items, sangria + "  ")}`
        : linea;
    })
    .join("\n");
}
async function llamarProxy(
  helper: "extraer" | "preguntar",
  cuerpo: Record<string, unknown>,
): Promise<
  { ok: true; texto: string } | { ok: false; code: ErrorIA; message: string }
> {
  const p = proxy();
  if (!p) {
    return { ok: false, code: "error", message: "La IA no está configurada en este sistema." };
  }
  let res: Response;
  try {
    res = await fetch(`${p.url}/v1/ai/chat_completion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.key}`,
        "Content-Type": "application/json",
        "X-Beon-Helper": helper,
        "X-Beon-Env": entornoActual(),
      },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "error", message: "No pudimos usar la IA. Probá de nuevo en un momento." };
  }
  if (res.status === 402) {
    return {
      ok: false,
      code: "insufficient_credits",
      message: "El servicio de IA no tiene saldo disponible. Revisa su configuración.",
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      code: "daily_ai_cap_reached",
      message: "Este sistema llegó al tope diario de IA. Se reanuda mañana.",
    };
  }
  if (!res.ok) {
    return { ok: false, code: "error", message: "No pudimos usar la IA. Probá de nuevo en un momento." };
  }
  let body: { result?: { choices?: Array<{ message?: { content?: string } }> } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, code: "error", message: "No pudimos usar la IA. Probá de nuevo en un momento." };
  }
  const texto = body.result?.choices?.[0]?.message?.content ?? "";
  if (!texto) {
    return { ok: false, code: "error", message: "La IA no devolvió una respuesta." };
  }
  return { ok: true, texto };
}
/**
 * Lee uno o más archivos (fotos o PDFs) y devuelve los campos pedidos, ya
 * tipados. Es lo que usa la pieza `<CargarDesdeArchivo>`.
 *
 * Server-side only (Route Handler o Server Action). Nunca levanta: los errores
 * que el usuario tiene que ver vuelven como `{ ok: false, code }`.
 */
export async function extraerDatos(input: {
  archivos: ArchivoEntrada[];
  campos: Campo[];
  /** Opcional: de qué es el archivo. Mejora bastante la lectura. */
  contexto?: string;
  locale?: "es" | "pt";
}): Promise<ResultadoExtraccion> {
  const invalido = validarArchivos(input.archivos);
  if (invalido) return { ok: false, code: "archivo_ilegible", message: invalido };
  if (!input.campos.length) {
    return { ok: false, code: "error", message: "No pediste ningún campo para leer." };
  }
  const idioma = input.locale === "pt" ? "portugués de Brasil" : "castellano";
  const instruccion = [
    "Leé los archivos adjuntos y extraé los campos de la lista.",
    input.contexto ? `Contexto: ${input.contexto}.` : "",
    "",
    "Campos:",
    descripcionDeCampos(input.campos),
    "",
    "Reglas:",
    "- Si un dato no está en el archivo, omití esa clave. No inventes ni completes por analogía.",
    "- Los importes van como número, sin símbolo de moneda ni separador de miles.",
    "- Las fechas van en formato AAAA-MM-DD.",
    `- Las observaciones se escriben en ${idioma}.`,
    "- Si los totales no cierran con la suma de los ítems, decilo en observaciones con los dos números.",
  ]
    .filter(Boolean)
    .join("\n");
  const contenido: Bloque[] = [
    { type: "text", text: instruccion },
    ...bloquesDeArchivos(input.archivos),
  ];
  const r = await llamarProxy("extraer", {
    messages: [{ role: "user", content: contenido }],
    model: "claude-sonnet",
    // Alto a propósito: una factura con muchos ítems trunca el JSON a la mitad
    // con un tope chico, y con schema forzado eso es un error, no un resultado
    // parcial. `max_tokens` es un techo, no un cobro: se paga lo que sale.
    max_tokens: 32000,
    json_schema: schemaDeExtraccion(input.campos),
  });
  if (!r.ok) return r;
  let leido: { datos?: Record<string, unknown>; confianza?: string; observaciones?: string[] };
  try {
    leido = JSON.parse(r.texto) as typeof leido;
  } catch {
    return {
      ok: false,
      code: "archivo_ilegible",
      message: "No pude leer este archivo. Probá con otra foto o con el PDF original.",
    };
  }
  const confianza = leido.confianza === "alta" || leido.confianza === "baja" ? leido.confianza : "media";
  return {
    ok: true,
    datos: leido.datos ?? {},
    confianza,
    observaciones: Array.isArray(leido.observaciones) ? leido.observaciones : [],
  };
}
/**
 * Texto o JSON a partir de una instrucción: clasificar, resumir, redactar,
 * sugerir. Con `jsonSchema` la respuesta cumple ese esquema garantizado (usalo
 * cuando la salida la lee el código); sin él, vuelve texto (cuando la lee una
 * persona).
 *
 * Server-side only. Nunca levanta.
 */
export async function preguntarIA(input: {
  instruccion: string;
  /** El texto sobre el que trabajar (la consulta a clasificar, el detalle a resumir). */
  texto?: string;
  archivos?: ArchivoEntrada[];
  jsonSchema?: Record<string, unknown>;
  locale?: "es" | "pt";
}): Promise<ResultadoPregunta> {
  const archivos = input.archivos ?? [];
  if (archivos.length) {
    const invalido = validarArchivos(archivos);
    if (invalido) return { ok: false, code: "archivo_ilegible", message: invalido };
  }
  const idioma = input.locale === "pt" ? "portugués de Brasil" : "castellano";
  const contenido: Bloque[] = [
    {
      type: "text",
      text: [
        input.instruccion,
        input.texto ? `\n---\n${input.texto}` : "",
        input.jsonSchema ? "" : `\nRespondé en ${idioma}, sin preámbulo.`,
      ]
        .filter(Boolean)
        .join(""),
    },
    ...bloquesDeArchivos(archivos),
  ];
  const r = await llamarProxy("preguntar", {
    messages: [{ role: "user", content: contenido }],
    model: "claude-sonnet",
    max_tokens: 8000,
    ...(input.jsonSchema ? { json_schema: input.jsonSchema } : {}),
  });
  if (!r.ok) return r;
  if (!input.jsonSchema) return { ok: true, texto: r.texto };
  try {
    return { ok: true, datos: JSON.parse(r.texto) };
  } catch {
    return { ok: false, code: "error", message: "La IA no devolvió el resultado esperado." };
  }
}
