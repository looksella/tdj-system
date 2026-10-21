/**
 * La pantalla intermedia de los links de email: `/auth/confirmar`.
 *
 * SPEC_INVITACIONES_QUE_NO_SE_QUEMAN Bloque 4. Hasta acá `/auth/confirm`
 * consumía el token en el `GET`, así que cualquier cosa que siguiera el link
 * lo quemaba antes de que lo abriera una persona: el unfurler de Slack, el
 * escáner de Gmail, la previsualización de WhatsApp, un antivirus corporativo.
 * Ahora el `GET` no toca Supabase y manda acá; el token se consume recién
 * cuando alguien aprieta el botón, que hace `POST /auth/confirm`.
 *
 * Es PLOMERÍA (se pisa siempre) aunque sea una página: es superficie de
 * contrato de la plataforma —la escribe `/auth/confirm` y su botón vuelve
 * ahí—, no la cara del negocio. Y siendo una ruta NUEVA, cualquier otra
 * política la dejaría sin llegar a los proyectos que YA tienen el molde, que
 * son justo los que hoy sufren el bug.
 *
 * **Vive en `/auth/*` y NO en `/confirmar` a secas**, por lo mismo que
 * `/auth/acceso` (Bloque 2): `PUBLIC_PATHS` matchea con `startsWith`, así que
 * declarar `/confirmar` abriría sin sesión cualquier pantalla del dueño que
 * empiece igual (`/confirmar-pedido` es un nombre de módulo perfectamente
 * esperable en una app hecha por el agente libre), y una `app/confirmar/page.tsx`
 * del negocio chocaría con esta —los route groups NO afectan la URL— y rompería
 * el `npm run build` de una app publicada que hoy anda. `/auth/*` ya es
 * namespace de la plataforma: ahí el único archivo posible es el nuestro.
 *
 * Por lo mismo NO está en el route group `(auth)` y no hereda su layout: trae
 * su propio contenedor centrado, el mismo que ese layout aplica.
 *
 * ⚠️ **Server Component a propósito, y el botón es un `<form method="post">`
 * nativo.** Con `"use client"` + `useSearchParams()` Next 15 prerenderiza la
 * página estática, muestra el fallback del `<Suspense>` y rellena en el
 * browser: sin JavaScript no aparecería ningún botón y el invitado quedaría
 * varado ACÁ, que es el paso que este bloque agrega. Leyendo `searchParams`
 * del lado del servidor la página es dinámica, el HTML ya trae el form con sus
 * hidden y el token se consume sin una línea de JS. (Las pantallas de destino
 * —`/reset-password`, `/auth/acceso`— siguen siendo Client Components: lo que
 * esta página garantiza es que el link no se pierda en el camino, no que el
 * resto del login ande sin JS.) Por lo mismo NO hay `onSubmit`: el submit es
 * del browser.
 */
import { redirect } from "next/navigation";
import { at } from "@/lib/auth-textos";
/** Nunca se prerenderiza: el sobre viaja en la query. */
export const dynamic = "force-dynamic";
/** El `type` original del link. Decide el copy, nada más. */
type Flujo = "invite" | "recovery" | "signup";
function copyDe(flujo: string): { titulo: string; detalle: string; cta: string } {
  const porFlujo: Record<Flujo, { titulo: string; detalle: string; cta: string }> = {
    invite: {
      titulo: at.confirmar.inviteTitulo,
      detalle: at.confirmar.inviteDetalle,
      cta: at.confirmar.inviteCta,
    },
    recovery: {
      titulo: at.confirmar.recoveryTitulo,
      detalle: at.confirmar.recoveryDetalle,
      cta: at.confirmar.recoveryCta,
    },
    signup: {
      titulo: at.confirmar.signupTitulo,
      detalle: at.confirmar.signupDetalle,
      cta: at.confirmar.signupCta,
    },
  };
  return (
    porFlujo[flujo as Flujo] ?? {
      // magiclink y cualquier `type` que Supabase agregue después.
      titulo: at.confirmar.genericoTitulo,
      detalle: at.confirmar.genericoDetalle,
      cta: at.confirmar.genericoCta,
    }
  );
}
/**
 * ¿Es una ruta de ESTA app? `startsWith("/")` solo no alcanza: `//evil.com` es
 * un URL protocol-relative, y `new URL("//evil.com", origin)` resuelve a
 * `https://evil.com/`. O sea que un `?next=//evil.com` convertiría el link de
 * invitación en un redirect abierto, firmado por el dominio del dueño.
 */
function esRutaInterna(valor: string): boolean {
  return valor.startsWith("/") && !valor.startsWith("//");
}
/** Un valor de la query puede llegar repetido (`?type=a&type=b`). */
function uno(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}
export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = uno(params.token_hash);
  const tipo = uno(params.type);
  const siguiente = uno(params.next);
  // Sin el sobre no hay nada que confirmar: el link llegó cortado al copiarlo.
  // Mismo vocabulario de motivos que `/auth/confirm` y `/auth/callback`.
  if (!tokenHash || !tipo) {
    const url = new URLSearchParams({ motivo: "link_incompleto" });
    if (tipo) url.set("flujo", tipo);
    redirect(`/auth/acceso?${url.toString()}`);
  }
  const { titulo, detalle, cta } = copyDe(tipo);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{detalle}</p>
        <form method="post" action="/auth/confirm" className="space-y-2">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={tipo} />
          {esRutaInterna(siguiente) && (
            <input type="hidden" name="next" value={siguiente} />
          )}
          <button
            type="submit"
            className="block w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {cta}
          </button>
        </form>
        <p className="text-xs text-muted-foreground">{at.confirmar.porQue}</p>
      </div>
    </div>
  );
}
