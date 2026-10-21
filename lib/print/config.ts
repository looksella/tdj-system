/**
 * Formatos de impresión del sistema. TAMAÑOS = CONFIGURACIÓN, NO CSS HORNEADO.
 *
 * En la PyME de LATAM el papel no es opcional: ticket de venta, etiqueta para
 * pegarle al equipo en reparación, presupuesto en PDF, comanda. Y cada negocio
 * imprime distinto: una térmica de 58mm no es una de 80mm, y ninguna es una A4.
 * Por eso el tamaño vive acá, en una constante, y no repetido adentro de cada
 * página: cambiar de impresora es tocar un valor (o la pantalla de ajustes),
 * nunca reescribir componentes.
 *
 * Defaults: 80mm y A4, que es lo más común en Argentina.
 */
export type FamiliaImpresion = "ticket" | "etiqueta" | "documento";
export interface FormatoImpresion {
  familia: FamiliaImpresion;
  /** Ancho del papel. `auto` de alto = rollo continuo (térmicas). */
  anchoMm: number;
  altoMm: number | "auto";
  /** Márgenes en mm: [arriba, derecha, abajo, izquierda]. */
  margenesMm: [number, number, number, number];
  /** Tamaño de fuente base en pt. Las térmicas necesitan menos. */
  fuentePt: number;
}
/** Rollos térmicos: los dos anchos que existen en la calle. */
export const TICKET_58: FormatoImpresion = {
  familia: "ticket",
  anchoMm: 58,
  altoMm: "auto",
  margenesMm: [2, 2, 2, 2],
  fuentePt: 8,
};
export const TICKET_80: FormatoImpresion = {
  familia: "ticket",
  anchoMm: 80,
  altoMm: "auto",
  margenesMm: [3, 3, 3, 3],
  fuentePt: 9,
};
/** Etiquetas autoadhesivas: las medidas que se consiguen en cualquier librería. */
export const ETIQUETA_50x25: FormatoImpresion = {
  familia: "etiqueta",
  anchoMm: 50,
  altoMm: 25,
  margenesMm: [1, 1, 1, 1],
  fuentePt: 7,
};
export const ETIQUETA_60x40: FormatoImpresion = {
  familia: "etiqueta",
  anchoMm: 60,
  altoMm: 40,
  margenesMm: [2, 2, 2, 2],
  fuentePt: 8,
};
export const ETIQUETA_100x50: FormatoImpresion = {
  familia: "etiqueta",
  anchoMm: 100,
  altoMm: 50,
  margenesMm: [3, 3, 3, 3],
  fuentePt: 9,
};
/** Documentos: presupuesto, remito, orden de trabajo, informe. */
export const A4: FormatoImpresion = {
  familia: "documento",
  anchoMm: 210,
  altoMm: 297,
  margenesMm: [15, 15, 15, 15],
  fuentePt: 10,
};
export const CARTA: FormatoImpresion = {
  familia: "documento",
  anchoMm: 216,
  altoMm: 279,
  margenesMm: [15, 15, 15, 15],
  fuentePt: 10,
};
export const FORMATOS = {
  ticket_58: TICKET_58,
  ticket_80: TICKET_80,
  etiqueta_50x25: ETIQUETA_50x25,
  etiqueta_60x40: ETIQUETA_60x40,
  etiqueta_100x50: ETIQUETA_100x50,
  a4: A4,
  carta: CARTA,
} as const;
export type FormatoId = keyof typeof FORMATOS;
/**
 * Formato elegido por familia. ESTA es la constante a tocar para cambiar de
 * impresora en todo el sistema de una sola vez. Si la app expone la pantalla de
 * ajustes (`AjustesImpresion`), lo que el usuario elija pisa estos defaults.
 */
export const FORMATO_POR_DEFECTO: Record<FamiliaImpresion, FormatoId> = {
  ticket: "ticket_80",
  etiqueta: "etiqueta_60x40",
  documento: "a4",
};
const CLAVE_AJUSTES = "ajustes-impresion";
/**
 * Formato vigente para una familia: lo que el usuario eligió en Ajustes, o el
 * default. Se lee de `localStorage` para que funcione sin tabla ni endpoint; si
 * el sistema necesita que el ajuste sea del NEGOCIO y no del navegador, guardalo
 * en una tabla de configuración y pasá el id por prop.
 */
export function formatoDe(familia: FamiliaImpresion): FormatoImpresion {
  const elegido = leerAjustes()[familia];
  const id = elegido && elegido in FORMATOS ? elegido : FORMATO_POR_DEFECTO[familia];
  return FORMATOS[id];
}
export function leerAjustes(): Partial<Record<FamiliaImpresion, FormatoId>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CLAVE_AJUSTES);
    return raw ? (JSON.parse(raw) as Partial<Record<FamiliaImpresion, FormatoId>>) : {};
  } catch {
    return {};
  }
}
export function guardarAjuste(familia: FamiliaImpresion, id: FormatoId): void {
  if (typeof window === "undefined") return;
  try {
    const actual = leerAjustes();
    window.localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({ ...actual, [familia]: id }));
  } catch {
    // Sin localStorage (modo privado) se sigue imprimiendo con el default.
  }
}
/** Etiqueta legible para la pantalla de ajustes. */
export function nombreFormato(id: FormatoId): string {
  const f = FORMATOS[id];
  if (f.altoMm === "auto") return `Rollo ${f.anchoMm}mm (térmica)`;
  if (f.familia === "etiqueta") return `Etiqueta ${f.anchoMm} × ${f.altoMm}mm`;
  return id === "a4" ? "A4 (210 × 297mm)" : "Carta (216 × 279mm)";
}
