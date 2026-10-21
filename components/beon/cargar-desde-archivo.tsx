"use client";
// ============================================================
// PLATFORM FILE — components/beon/cargar-desde-archivo.tsx
// Generado e inyectado por TuSistema. NO editar ni reescribir.
// La parte genérica de "cargar datos desde una foto o un PDF":
// adjuntar, achicar la foto, leerla con IA, mostrar los campos
// para revisar y confirmar. Lo específico de cada negocio (a qué
// tablas va, qué se crea si no existe) va en `onConfirmar`.
//
// Solo Tailwind del scaffold: no importa nada de la app para que
// la pieza no se rompa cuando el sistema cambia.
// ============================================================
import { useRef, useState } from "react";
export type TipoCampo = "texto" | "numero" | "fecha" | "moneda" | "lista";
export interface Campo {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  descripcion?: string;
  items?: Campo[];
}
interface Props {
  /** Qué campos tiene que leer. Usá los nombres reales de tus columnas. */
  campos: Campo[];
  titulo: string;
  ayuda?: string;
  /** Qué hacer con los datos ya revisados. Acá va la lógica de tu negocio. */
  onConfirmar: (datos: Record<string, unknown>) => Promise<unknown> | unknown;
  /** Opcional: de qué es el archivo. Mejora la lectura. */
  contexto?: string;
  locale?: "es" | "pt";
  /** Se llama al terminar bien, por si querés cerrar un modal o refrescar. */
  onListo?: () => void;
}
const COPY = {
  es: {
    adjuntar: "Adjuntar",
    cambiar: "Cambiar archivo",
    leyendo: "Leyendo el archivo…",
    lei: "Leí esto (revisá antes de confirmar):",
    confirmar: "Confirmar",
    guardando: "Guardando…",
    cancelar: "Cancelar",
    agregarFila: "Agregar fila",
    quitar: "Quitar",
    confianzaBaja: "El archivo se leía con dificultad. Revisá bien los valores antes de confirmar.",
    costo: "Leer un archivo usa ≈ 0,3 créditos.",
    sinCreditos: "Cargar créditos",
    errorGuardar: "No pudimos guardar. Probá de nuevo.",
    vacio: "No pude leer ningún campo de este archivo. Probá con otra foto.",
  },
  pt: {
    adjuntar: "Anexar",
    cambiar: "Trocar arquivo",
    leyendo: "Lendo o arquivo…",
    lei: "Li isto (confira antes de confirmar):",
    confirmar: "Confirmar",
    guardando: "Salvando…",
    cancelar: "Cancelar",
    agregarFila: "Adicionar linha",
    quitar: "Remover",
    confianzaBaja: "O arquivo estava difícil de ler. Confira bem os valores antes de confirmar.",
    costo: "Ler um arquivo usa ≈ 0,3 créditos.",
    sinCreditos: "Adicionar créditos",
    errorGuardar: "Não conseguimos salvar. Tente de novo.",
    vacio: "Não consegui ler nenhum campo deste arquivo. Tente outra foto.",
  },
} as const;
const MAX_ARCHIVOS = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const LADO_MAXIMO = 1600;
type Estado = "vacio" | "leyendo" | "revisando" | "guardando";
/** Achica la foto antes de mandarla: una foto de teléfono son 4 MB y el body
 *  de una función de Vercel se corta en 4,5 MB. Los PDF van tal cual. */
async function aBase64(file: File): Promise<{ nombre: string; tipo: string; base64: string }> {
  if (file.type === "application/pdf") {
    const buf = await file.arrayBuffer();
    return { nombre: file.name, tipo: file.type, base64: aB64(buf) };
  }
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("no blob");
  return { nombre: file.name, tipo: "image/jpeg", base64: aB64(await blob.arrayBuffer()) };
}
function aB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}
function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}
function tipar(valor: string, tipo: TipoCampo): unknown {
  if (valor === "") return null;
  if (tipo === "numero" || tipo === "moneda") {
    const n = Number(valor.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return valor;
}
export function CargarDesdeArchivo({
  campos,
  titulo,
  ayuda,
  onConfirmar,
  contexto,
  locale = "es",
  onListo,
}: Props) {
  const t = COPY[locale] ?? COPY.es;
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>("vacio");
  const [nombres, setNombres] = useState<string[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [filas, setFilas] = useState<Record<string, Array<Record<string, string>>>>({});
  const [confianza, setConfianza] = useState<"alta" | "media" | "baja">("alta");
  const [observaciones, setObservaciones] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; creditsUrl?: string } | null>(null);
  const simples = campos.filter((c) => c.tipo !== "lista");
  const listas = campos.filter((c) => c.tipo === "lista");
  function limpiar() {
    setEstado("vacio");
    setNombres([]);
    setValores({});
    setFilas({});
    setObservaciones([]);
    setConfianza("alta");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }
  async function alElegir(lista: FileList | null) {
    if (!lista || !lista.length) return;
    setError(null);
    const elegidos = Array.from(lista).slice(0, MAX_ARCHIVOS);
    const pesado = elegidos.find((f) => f.type === "application/pdf" && f.size > MAX_BYTES);
    if (pesado) {
      setError({ message: `"${pesado.name}" pesa más de 4 MB. Subí un PDF más liviano.` });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setEstado("leyendo");
    setNombres(elegidos.map((f) => f.name));
    try {
      const archivos = await Promise.all(elegidos.map(aBase64));
      const res = await fetch("/api/beon/ia/extraer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivos, campos, contexto, locale }),
      });
      const data = (await res.json()) as
        | { ok: true; datos: Record<string, unknown>; confianza: "alta" | "media" | "baja"; observaciones: string[] }
        | { ok: false; code: string; message: string; creditsUrl?: string };
      if (!data.ok) {
        setError({ message: data.message, creditsUrl: data.creditsUrl });
        setEstado("vacio");
        return;
      }
      const nuevosValores: Record<string, string> = {};
      for (const c of simples) nuevosValores[c.nombre] = comoTexto(data.datos[c.nombre]);
      const nuevasFilas: Record<string, Array<Record<string, string>>> = {};
      for (const c of listas) {
        const crudas = Array.isArray(data.datos[c.nombre]) ? (data.datos[c.nombre] as unknown[]) : [];
        nuevasFilas[c.nombre] = crudas.map((fila) => {
          const f: Record<string, string> = {};
          for (const hijo of c.items ?? []) {
            f[hijo.nombre] = comoTexto((fila as Record<string, unknown>)?.[hijo.nombre]);
          }
          return f;
        });
      }
      const algo =
        Object.values(nuevosValores).some((v) => v !== "") ||
        Object.values(nuevasFilas).some((f) => f.length > 0);
      if (!algo) {
        setError({ message: t.vacio });
        setEstado("vacio");
        return;
      }
      setValores(nuevosValores);
      setFilas(nuevasFilas);
      setConfianza(data.confianza);
      setObservaciones(data.observaciones ?? []);
      setEstado("revisando");
    } catch {
      setError({ message: t.vacio });
      setEstado("vacio");
    }
  }
  async function confirmar() {
    setEstado("guardando");
    setError(null);
    const datos: Record<string, unknown> = {};
    for (const c of simples) datos[c.nombre] = tipar(valores[c.nombre] ?? "", c.tipo);
    for (const c of listas) {
      datos[c.nombre] = (filas[c.nombre] ?? []).map((fila) => {
        const salida: Record<string, unknown> = {};
        for (const hijo of c.items ?? []) salida[hijo.nombre] = tipar(fila[hijo.nombre] ?? "", hijo.tipo);
        return salida;
      });
    }
    try {
      await onConfirmar(datos);
      limpiar();
      onListo?.();
    } catch {
      setError({ message: t.errorGuardar });
      setEstado("revisando");
    }
  }
  const inputClase =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{titulo}</h3>
          {ayuda ? <p className="text-sm text-muted-foreground">{ayuda}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={estado === "leyendo" || estado === "guardando"}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {estado === "revisando" ? t.cambiar : t.adjuntar}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          capture="environment"
          className="hidden"
          onChange={(e) => void alElegir(e.target.files)}
        />
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span>{error.message}</span>
          {error.creditsUrl ? (
            <a
              href={error.creditsUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 font-medium underline"
            >
              {t.sinCreditos}
            </a>
          ) : null}
        </div>
      ) : null}
      {estado === "leyendo" ? (
        <p className="mt-4 animate-pulse text-sm text-muted-foreground">
          {t.leyendo} {nombres.join(", ")}
        </p>
      ) : null}
      {estado === "revisando" || estado === "guardando" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-medium">{t.lei}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {simples.map((c) => (
              <label key={c.nombre} className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{c.etiqueta}</span>
                <input
                  className={inputClase}
                  type={c.tipo === "fecha" ? "date" : c.tipo === "numero" || c.tipo === "moneda" ? "number" : "text"}
                  step={c.tipo === "moneda" ? "0.01" : undefined}
                  value={valores[c.nombre] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [c.nombre]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {listas.map((c) => (
            <div key={c.nombre} className="space-y-2">
              <p className="text-sm text-muted-foreground">{c.etiqueta}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      {(c.items ?? []).map((h) => (
                        <th key={h.nombre} className="px-1 pb-1 font-normal">
                          {h.etiqueta}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(filas[c.nombre] ?? []).map((fila, i) => (
                      <tr key={i}>
                        {(c.items ?? []).map((h) => (
                          <td key={h.nombre} className="px-1 py-1">
                            <input
                              className={inputClase}
                              type={
                                h.tipo === "fecha"
                                  ? "date"
                                  : h.tipo === "numero" || h.tipo === "moneda"
                                    ? "number"
                                    : "text"
                              }
                              step={h.tipo === "moneda" ? "0.01" : undefined}
                              value={fila[h.nombre] ?? ""}
                              onChange={(e) =>
                                setFilas((f) => {
                                  const copia = [...(f[c.nombre] ?? [])];
                                  copia[i] = { ...copia[i], [h.nombre]: e.target.value };
                                  return { ...f, [c.nombre]: copia };
                                })
                              }
                            />
                          </td>
                        ))}
                        <td className="px-1">
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() =>
                              setFilas((f) => ({
                                ...f,
                                [c.nombre]: (f[c.nombre] ?? []).filter((_, j) => j !== i),
                              }))
                            }
                          >
                            {t.quitar}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="text-xs font-medium underline"
                onClick={() =>
                  setFilas((f) => ({ ...f, [c.nombre]: [...(f[c.nombre] ?? []), {}] }))
                }
              >
                {t.agregarFila}
              </button>
            </div>
          ))}
          {confianza === "baja" ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">{t.confianzaBaja}</p>
          ) : null}
          {observaciones.map((o, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              ⓘ {o}
            </p>
          ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={limpiar}
              disabled={estado === "guardando"}
              className="rounded-md border border-input px-4 py-2 text-sm disabled:opacity-50"
            >
              {t.cancelar}
            </button>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={estado === "guardando"}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {estado === "guardando" ? t.guardando : t.confirmar}
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">{t.costo}</p>
    </div>
  );
}
export default CargarDesdeArchivo;
