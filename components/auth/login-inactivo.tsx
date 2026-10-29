import { at } from "@/lib/auth-textos";
/**
 * Mensaje compartido cuando faltan las variables públicas de Supabase.
 * El texto está en el pack de idioma para conservar la localización.
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
