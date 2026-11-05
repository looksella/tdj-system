import { TituloBienvenida } from "@/components/auth/titulo-bienvenida";
import { at } from "@/lib/auth-textos";

/**
 * Mensaje compartido cuando faltan las variables públicas de Supabase.
 * El texto está en el pack de idioma para conservar la localización.
 */
export function LoginInactivo() {
  return (
    <div className="space-y-4 text-center">
      <TituloBienvenida />
      <p className="text-sm text-foreground/75">{at.loginInactivo.abierto}</p>
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-foreground/80">
        {at.loginInactivo.comoSeActiva}
      </p>
    </div>
  );
}
