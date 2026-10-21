/**
 * Impresión del sistema: ticket térmico, etiqueta autoadhesiva y documento.
 *
 * Importá siempre desde acá: `import { PrintFrame, TicketVenta } from "@/lib/print"`.
 *
 * Regla: NO escribas CSS de impresión a mano ni hornees tamaños de papel en una
 * página. El tamaño es configuración (`config.ts`) y el CSS lo genera
 * `PrintFrame` adentro de su iframe.
 */
export {
  A4,
  CARTA,
  ETIQUETA_50x25,
  ETIQUETA_60x40,
  ETIQUETA_100x50,
  FORMATOS,
  FORMATO_POR_DEFECTO,
  TICKET_58,
  TICKET_80,
  formatoDe,
  guardarAjuste,
  leerAjustes,
  nombreFormato,
  type FamiliaImpresion,
  type FormatoId,
  type FormatoImpresion,
} from "./config";
export { cssDeFormato } from "./styles";
export { PrintFrame, type PrintFrameHandle } from "./print-frame";
export { DocumentoA4, EtiquetaPedido, TicketVenta, type LineaImpresa } from "./documents";
export { AjustesImpresion } from "./ajustes-impresion";
