import { at } from "@/lib/auth-textos";
/**
 * Lo que ven `/admin/usuarios`, `/setup` y `/sign-in` mientras el login de este
 * sistema todavía no está activo.
 *
 * Sin un componente propio cada pantalla tendría su versión del mismo texto y
 * terminarían diciendo cosas distintas sobre lo mismo. El copy explica DOS
 * cosas, en este orden: que hoy cualquiera con el link entra (es lo que más le
 * importa saber al dueño) y que el login se activa desde TuSistema con un plan.
 *
 * Sin botón a propósito: la acción no vive acá, vive en TuSistema. Un botón
 * adentro del sistema publicado llevaría a alguien que no es el dueño a una
 * pantalla que no es suya.
 *
 * El copy sale del pack (`lib/auth-textos.ts`), no de acá: esta es la pantalla
 * más probable de un sistema recién nacido, así que hornearla en castellano era
 * garantizar que el dueño brasileño leyera voseo en lo primero que abre.
 *
 * `titulo` NO tiene default a propósito. El default anterior era `"Usuarios"`,
 * que en `/sign-in` y en `/setup` es el encabezado equivocado además de estar
 * en un solo idioma; y como cada pantalla tiene el suyo, no existe un valor
 * correcto que poner. Sin default, un call site nuevo que se olvide del título
 * no compila — el compilador avisa en vez de publicar una pantalla que dice
 * otra cosa.
 *
 * Presentacional puro (sin hooks, sin fetch): se renderiza igual desde un
 * Server Component que desde uno con "use client". `at` es una constante de
 * módulo, no un hook, así que importarla no cambia eso.
 */
export function LoginInactivo({ titulo }: { titulo: string }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-6 text-center">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="text-sm text-muted-foreground">
        {at.loginInactivo.abierto}
      </p>
      <p className="text-sm text-muted-foreground">
        {at.loginInactivo.comoSeActiva}
      </p>
    </div>
  );
}
