/**
 * Componentes de referencia de las tres familias. Son el ESQUELETO: el agente
 * los especializa por negocio (qué columnas, qué datos fiscales, qué pie), no
 * los usa tal cual ni los reescribe de cero.
 *
 * Las clases (`print-ticket`, `print-etiqueta`, `print-documento`) las estila el
 * CSS que inyecta `PrintFrame` adentro del iframe. NO usan Tailwind a propósito:
 * el iframe no carga el CSS de la app, y depender de eso es lo que hace que el
 * ticket salga sin estilos.
 */
import type { ReactNode } from "react";
import { formatDate, formatDateTime, formatMoney } from "@/lib/locale";
export interface LineaImpresa {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}
const money = formatMoney;
/** Ticket de mostrador para impresora térmica (rollo continuo). */
export function TicketVenta({
  negocio,
  comprobante,
  fecha,
  lineas,
  total,
  pago,
  pie,
}: {
  negocio: string;
  comprobante: string;
  fecha: Date | string;
  lineas: LineaImpresa[];
  total: number;
  pago?: string;
  pie?: ReactNode;
}) {
  const f = typeof fecha === "string" ? new Date(fecha) : fecha;
  return (
    <div className="print-ticket">
      <div className="centro">
        <div className="titulo">{negocio}</div>
        <div>{formatDateTime(f)}</div>
        <div>{comprobante}</div>
      </div>
      <div className="separador" />
      {lineas.map((l, i) => (
        <div key={i}>
          <div>{l.descripcion}</div>
          <div className="fila">
            <span>
              {l.cantidad} × {money(l.precioUnitario)}
            </span>
            <span>{money(l.total)}</span>
          </div>
        </div>
      ))}
      <div className="separador" />
      <div className="fila total">
        <span>TOTAL</span>
        <span>{money(total)}</span>
      </div>
      {pago ? (
        <div className="fila">
          <span>Pago</span>
          <span>{pago}</span>
        </div>
      ) : null}
      <div className="pie">{pie ?? "¡Gracias por su compra!"}</div>
    </div>
  );
}
/** Etiqueta autoadhesiva: alto fijo, para pegar en el equipo o el paquete. */
export function EtiquetaPedido({
  titulo,
  codigo,
  datos,
  pie,
}: {
  titulo: string;
  codigo: string;
  datos?: { etiqueta: string; valor: string }[];
  pie?: string;
}) {
  return (
    <div className="print-etiqueta">
      <div>
        <div className="titulo">{titulo}</div>
        <div className="codigo">{codigo}</div>
      </div>
      <div>
        {(datos ?? []).map((d, i) => (
          <div className="dato" key={i}>
            <span>{d.etiqueta}</span>
            <span>{d.valor}</span>
          </div>
        ))}
        {pie ? <div>{pie}</div> : null}
      </div>
    </div>
  );
}
/** Documento de hoja completa: presupuesto, remito, orden de trabajo. */
export function DocumentoA4({
  emisor,
  logoUrl,
  titulo,
  numero,
  fecha,
  destinatario,
  lineas,
  subtotal,
  extras,
  total,
  pie,
}: {
  emisor: string;
  logoUrl?: string | null;
  titulo: string;
  numero: string;
  fecha: Date | string;
  destinatario?: ReactNode;
  lineas: LineaImpresa[];
  subtotal?: number;
  /** Filas extra antes del total: IVA, descuento, envío. */
  extras?: { etiqueta: string; valor: number }[];
  total: number;
  pie?: ReactNode;
}) {
  const f = typeof fecha === "string" ? new Date(fecha) : fecha;
  return (
    <div className="print-documento">
      <div className="encabezado">
        <div>
          {/* `<img>` y no `next/image` a propósito: el iframe de impresión no
              corre el optimizador de Next, y una imagen lazy no llega a
              cargarse antes del `print()` — el logo sale en blanco. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl ? <img src={logoUrl} alt="" /> : null}
          <div className="emisor">{emisor}</div>
        </div>
        <div className="meta">
          <div className="emisor">{titulo}</div>
          <div>{numero}</div>
          <div>{formatDate(f)}</div>
        </div>
      </div>
      {destinatario ? <div style={{ marginBottom: "6mm" }}>{destinatario}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Detalle</th>
            <th className="num">Cant.</th>
            <th className="num">Unitario</th>
            <th className="num">Importe</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td>{l.descripcion}</td>
              <td className="num">{l.cantidad}</td>
              <td className="num">{money(l.precioUnitario)}</td>
              <td className="num">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totales no-cortar">
        {subtotal !== undefined ? (
          <div className="fila">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
        ) : null}
        {(extras ?? []).map((e, i) => (
          <div className="fila" key={i}>
            <span>{e.etiqueta}</span>
            <span>{money(e.valor)}</span>
          </div>
        ))}
        <div className="fila total">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>
      {pie ? <div className="pie">{pie}</div> : null}
    </div>
  );
}
