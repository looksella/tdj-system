"use client";
/**
 * `PrintFrame` — imprime un pedazo de la app sin romper la página.
 *
 * `window.print()` sobre una SPA imprime TODA la pantalla (sidebar, botones,
 * modales) y hay que taparla con `@media print { display:none }` en cada
 * componente, que se olvida siempre. Acá el contenido se monta en un iframe
 * oculto con su propio documento y su propio CSS, y se imprime ESE iframe: lo
 * que ves en el papel es exactamente lo que pusiste adentro del frame, sin
 * importar qué más haya en la pantalla.
 *
 * Uso:
 *
 *   const ticket = useRef<PrintFrameHandle>(null);
 *   ...
 *   <PrintFrame ref={ticket} familia="ticket">
 *     <TicketVenta venta={venta} negocio={negocio} />
 *   </PrintFrame>
 *   <Button onClick={() => ticket.current?.imprimir()}>Imprimir</Button>
 *
 * El formato sale de `lib/print/config` (familia → formato elegido o default).
 * Para forzar uno puntual, pasá `formato`.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatoDe, type FamiliaImpresion, type FormatoImpresion } from "./config";
import { cssDeFormato } from "./styles";
export interface PrintFrameHandle {
  imprimir: () => void;
}
interface PrintFrameProps {
  familia: FamiliaImpresion;
  /** Pisa el formato de la familia (ej. este comprobante siempre en A4). */
  formato?: FormatoImpresion;
  children: ReactNode;
}
export const PrintFrame = forwardRef<PrintFrameHandle, PrintFrameProps>(
  function PrintFrame({ familia, formato, children }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const styleRef = useRef<HTMLStyleElement | null>(null);
    const [cuerpo, setCuerpo] = useState<HTMLElement | null>(null);
    // El documento del iframe recién existe cuando cargó. Montar el portal antes
    // deja los hijos en la nada y el papel sale en blanco.
    //
    // Se usa el documento `about:blank` que el iframe ya trae, en vez de
    // rehacerlo con `document.write()`: reescribirlo vuelve a disparar el
    // `onLoad`, que llamaría a esta función otra vez, que lo reescribiría de
    // nuevo — un loop que deja el portal remontándose para siempre.
    const montar = useCallback(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.body) return;
      if (!styleRef.current || !doc.contains(styleRef.current)) {
        const style = doc.createElement("style");
        styleRef.current = style;
        doc.head.appendChild(style);
      }
      styleRef.current.textContent = cssDeFormato(formato ?? formatoDe(familia));
      setCuerpo((prev) => (prev === doc.body ? prev : doc.body));
    }, [familia, formato]);
    useEffect(() => {
      // El `about:blank` de un iframe suele estar listo antes de que dispare
      // `onLoad`; si ya lo está, se monta sin esperar el evento.
      montar();
    }, [montar]);
    useImperativeHandle(ref, () => ({
      imprimir: () => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        // El focus es necesario en Safari: sin él imprime la ventana de arriba.
        win.focus();
        win.print();
      },
    }), []);
    return (
      <>
        <iframe
          ref={iframeRef}
          onLoad={montar}
          title="Vista de impresión"
          aria-hidden
          tabIndex={-1}
          // Fuera de pantalla en vez de `display:none`: un iframe oculto no
          // renderiza y sale en blanco en varios navegadores.
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "210mm",
            height: "297mm",
            border: 0,
            visibility: "hidden",
          }}
        />
        {cuerpo ? createPortal(children, cuerpo) : null}
      </>
    );
  },
);
