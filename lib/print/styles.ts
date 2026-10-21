/**
 * Hojas de estilo de impresión, generadas desde el formato.
 *
 * Se generan en vez de vivir en tres `.css` fijos por un motivo concreto: la
 * regla `@page { size: ... }` NO acepta variables CSS, así que un stylesheet
 * estático obligaría a hornear el tamaño del papel — justo lo que este módulo
 * evita. El resto de las medidas sí salen como variables, para que un
 * componente pueda ajustarlas sin tocar esto.
 *
 * El CSS se inyecta adentro del iframe de `PrintFrame`, no en la página: así no
 * hay riesgo de pisarle estilos a la app.
 */
import type { FormatoImpresion } from "./config";
function sizeDeclaracion(f: FormatoImpresion): string {
  return f.altoMm === "auto"
    ? `${f.anchoMm}mm auto`
    : `${f.anchoMm}mm ${f.altoMm}mm`;
}
/** Base común a las tres familias. */
function base(f: FormatoImpresion): string {
  const [t, r, b, l] = f.margenesMm;
  return `
@page { size: ${sizeDeclaracion(f)}; margin: ${t}mm ${r}mm ${b}mm ${l}mm; }
:root {
  --print-ancho: ${f.anchoMm}mm;
  --print-fuente: ${f.fuentePt}pt;
  --print-linea: 1.35;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: var(--print-fuente);
  line-height: var(--print-linea);
  color: #000; background: #fff;
  /* Sin esto las impresoras "ahorran tinta" y los fondos de las tablas
     desaparecen: el ticket sale con las filas sin separar. */
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
img { max-width: 100%; }
table { width: 100%; border-collapse: collapse; }
/* Un corte de página en la mitad de una fila deja el total colgado solo en la
   hoja siguiente. Es el bug clásico de imprimir tablas largas. */
tr, td, th, .no-cortar { break-inside: avoid; page-break-inside: avoid; }
.salto-antes { break-before: page; page-break-before: always; }
`.trim();
}
/** Rollo térmico: una sola columna angosta, sin bordes, todo alineado a mano. */
function ticket(f: FormatoImpresion): string {
  return `
${base(f)}
body { width: var(--print-ancho); }
.print-ticket { width: 100%; }
.print-ticket .centro { text-align: center; }
.print-ticket .titulo { font-weight: 700; font-size: calc(var(--print-fuente) + 2pt); }
.print-ticket .separador { border-top: 1px dashed #000; margin: 2mm 0; }
.print-ticket .fila { display: flex; justify-content: space-between; gap: 2mm; }
.print-ticket .fila > span:last-child { white-space: nowrap; }
.print-ticket .total { font-weight: 700; font-size: calc(var(--print-fuente) + 2pt); }
.print-ticket .pie { text-align: center; margin-top: 3mm; }
/* Cola de papel: sin esto la última línea queda pegada al corte. */
.print-ticket::after { content: ""; display: block; height: 8mm; }
`.trim();
}
/** Etiqueta autoadhesiva: alto FIJO, nada puede desbordar la hoja. */
function etiqueta(f: FormatoImpresion): string {
  return `
${base(f)}
body { width: ${f.anchoMm}mm; height: ${f.altoMm === "auto" ? "auto" : `${f.altoMm}mm`}; overflow: hidden; }
.print-etiqueta {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; justify-content: space-between;
  overflow: hidden;
}
.print-etiqueta .titulo {
  font-weight: 700; font-size: calc(var(--print-fuente) + 1pt);
  /* La etiqueta no crece: un nombre largo se corta con puntos suspensivos en
     vez de empujar el resto afuera del adhesivo. */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.print-etiqueta .dato { display: flex; justify-content: space-between; gap: 1mm; }
.print-etiqueta .codigo { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; letter-spacing: 0.5px; }
`.trim();
}
/** Documento: hoja completa con encabezado (logo), cuerpo y totales. */
function documento(f: FormatoImpresion): string {
  return `
${base(f)}
.print-documento .encabezado {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 8mm; padding-bottom: 4mm; border-bottom: 1px solid #000; margin-bottom: 6mm;
}
.print-documento .encabezado img { max-height: 18mm; max-width: 55mm; object-fit: contain; }
.print-documento .emisor { font-weight: 700; font-size: calc(var(--print-fuente) + 3pt); }
.print-documento .meta { text-align: right; white-space: nowrap; }
.print-documento table th {
  text-align: left; border-bottom: 1px solid #000; padding: 1.5mm 1mm; font-weight: 700;
}
.print-documento table td { padding: 1.5mm 1mm; border-bottom: 1px solid #ddd; vertical-align: top; }
.print-documento table .num { text-align: right; white-space: nowrap; }
/* El encabezado de la tabla se repite en cada hoja de un listado largo. */
.print-documento thead { display: table-header-group; }
.print-documento .totales { margin-top: 5mm; margin-left: auto; width: 70mm; }
.print-documento .totales .fila { display: flex; justify-content: space-between; padding: 1mm 0; }
.print-documento .totales .total {
  font-weight: 700; font-size: calc(var(--print-fuente) + 2pt);
  border-top: 1px solid #000; margin-top: 1mm; padding-top: 1.5mm;
}
.print-documento .pie { margin-top: 10mm; font-size: calc(var(--print-fuente) - 1pt); color: #444; }
`.trim();
}
export function cssDeFormato(f: FormatoImpresion): string {
  if (f.familia === "ticket") return ticket(f);
  if (f.familia === "etiqueta") return etiqueta(f);
  return documento(f);
}
