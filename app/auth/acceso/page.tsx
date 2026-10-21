"use client";
/**
 * Aterrizaje de un link de email que NO se pudo verificar: `/auth/acceso`.
 *
 * SPEC_INVITACIONES_QUE_NO_SE_QUEMAN Bloque 2. Antes `/auth/confirm` y
 * `/auth/callback` mandaban todo fallo al login con un código de error colgado
 * de la URL, y `/sign-in` nunca leyó ese parámetro: la persona invitada
 * aterrizaba en un formulario idéntico al normal, con una palabra en inglés en
 * la barra de direcciones, sin saber que el link se venció ni que la salida
 * (`/forgot-password`) estaba a un click.
 *
 * Es PLOMERÍA (se pisa siempre): es superficie de contrato de la plataforma,
 * no la cara del negocio. La URL es `/auth/acceso?motivo=<codigo>&flujo=<type>`.
 *
 * **Vive en `/auth/*` y no en `/acceso` a propósito.** `/acceso` es una palabra
 * común en castellano y ya es una pantalla del NEGOCIO en un molde vivo (la
 * puerta por DNI de `cuota-recurrente`): declararla pública abriría esa
 * pantalla sin sesión en toda app que la tenga. `/auth/*` ya es namespace de la
 * plataforma —esta página es la hermana de confirm y callback, el lugar donde
 * aterrizan sus fallos—, así que no puede chocar con nada del dueño.
 *
 * Por lo mismo NO está en el route group `(auth)` y no hereda su layout: trae
 * su propio contenedor centrado, el mismo que ese layout aplica.
 *
 * ⚠️ `useSearchParams()` obliga a un `<Suspense>` alrededor: sin el boundary,
 * Next 15 falla el `npm run build` con "useSearchParams() should be wrapped in
 * a suspense boundary". Por eso el contenido vive en un componente aparte.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { at } from "@/lib/auth-textos";
/** Qué pasó con el link. Lo escriben /auth/confirm y /auth/callback. */
type Motivo = "link_usado" | "link_incompleto" | "verificacion_fallida";
function AccesoContenido() {
  const params = useSearchParams();
  const motivo = (params.get("motivo") ?? "verificacion_fallida") as Motivo;
  const flujo = params.get("flujo");
  let titulo = at.acceso.genericoTitulo;
  let detalle = at.acceso.genericoDetalle;
  // El default es pedir un link nuevo: es la salida real de invite y recovery,
  // que son los dos flujos por los que llega casi todo el mundo acá.
  let ctaHref = "/forgot-password";
  let ctaTexto = at.acceso.ctaLinkNuevo;
  if (motivo === "link_usado" && flujo === "signup") {
    // Un registro ya confirmado no necesita link nuevo: necesita entrar.
    titulo = at.acceso.registroListoTitulo;
    detalle = at.acceso.registroListoDetalle;
    ctaHref = "/sign-in";
    ctaTexto = at.acceso.ctaIniciarSesion;
  } else if (motivo === "link_usado") {
    titulo = at.acceso.usadoTitulo;
    detalle = at.acceso.usadoDetalle;
  } else if (motivo === "link_incompleto") {
    titulo = at.acceso.incompletoTitulo;
    detalle = at.acceso.incompletoDetalle;
  }
  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="text-sm text-muted-foreground">{detalle}</p>
      <a
        href={ctaHref}
        className="block w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {ctaTexto}
      </a>
      {ctaHref !== "/sign-in" && (
        <p className="text-sm text-muted-foreground">
          <a href="/sign-in" className="underline">
            {at.comun.volverAlLogin}
          </a>
        </p>
      )}
    </div>
  );
}
export default function AccesoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">{at.comun.cargando}</p>
        }
      >
        <AccesoContenido />
      </Suspense>
    </div>
  );
}