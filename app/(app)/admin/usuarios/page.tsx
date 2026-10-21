import { redirect } from "next/navigation";
import { LoginInactivo } from "@/components/auth/login-inactivo";
import { UsuariosPanel } from "@/components/admin/usuarios-panel";
import { at } from "@/lib/auth-textos";
import { APP_ROLES } from "@/lib/auth-helpers";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import { getEffectiveUser } from "@/lib/supabase/helpers";
export const dynamic = "force-dynamic";
/** Server-only, sin prefijo `NEXT_PUBLIC_` (ver `lib/supabase/helpers.ts`). */
const ES_SANDBOX = process.env.BEON_SANDBOX_DEV === "1";
/** Sistema abierto: el plan del dueño terminó (ver `lib/supabase/helpers.ts`).
 *  Server-only, sin `NEXT_PUBLIC_`. */
const AUTH_ABIERTO = process.env.BEON_AUTH_MODE === "open";
/**
 * Gestión de usuarios — solo el admin.
 *
 * El guard corre en el SERVIDOR y el rol viaja por props: nunca se lee del
 * browser. Esto evita mostrar la pantalla, no reemplaza al control de acceso:
 * ese vive en `app/api/admin/usuarios/*`, que responde 403 sin rol admin.
 *
 * Con un solo rol configurado ("Solo yo" o "todos al mismo nivel") no hay nada
 * que elegir, así que el selector de rol no se muestra.
 */
export default async function UsuariosPage() {
  // El login todavía no está activo: la plataforma no inyectó las variables de
  // Supabase. Salir ACÁ, antes de tocar nada de Supabase, es el punto del
  // guard: `getEffectiveUser()` construye el cliente con
  // `process.env.NEXT_PUBLIC_SUPABASE_URL!` y sin la variable tira, así que
  // este ítem del menú devolvía una pantalla de error de Next adentro del
  // sistema del dueño. El sandbox queda afuera: ahí el login se bypassa a
  // propósito y la pantalla se comporta como siempre.
  //
  // Con el sistema ABIERTO la pantalla tampoco se muestra, y acá el motivo es
  // otro: cualquiera con el link entra como admin, así que el panel de
  // usuarios dejaría los emails de la gente del dueño a la vista de quien
  // pase. Las cuentas siguen existiendo; se vuelven a administrar cuando el
  // plan vuelve.
  if ((!LOGIN_ACTIVO || AUTH_ABIERTO) && !ES_SANDBOX) {
    return <LoginInactivo titulo={at.usuarios.tituloPagina} />;
  }
  const user = await getEffectiveUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{at.usuarios.tituloPagina}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {at.usuarios.bajadaPagina}
        </p>
      </div>
      <UsuariosPanel roles={[...APP_ROLES]} />
    </div>
  );
}