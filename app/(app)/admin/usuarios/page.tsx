import { UsuariosPanel } from "@/components/admin/usuarios-panel";
import { at } from "@/lib/auth-textos";
import { INVITABLE_ROLES } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/require-page-permission";
export const dynamic = "force-dynamic";
/**
 * User management — administrator and developer roles only.
 *
 * El guard corre en el SERVIDOR y el rol viaja por props: nunca se lee del
 * browser. Esto evita mostrar la pantalla, no reemplaza al control de acceso:
 * ese vive en `app/api/admin/usuarios/*`, que responde 403 sin rol admin.
 *
 * Con un solo rol configurado ("Solo yo" o "todos al mismo nivel") no hay nada
 * que elegir, así que el selector de rol no se muestra.
 */
export default async function UsuariosPage() {
  await requirePagePermission("users:manage");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{at.usuarios.tituloPagina}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {at.usuarios.bajadaPagina}
        </p>
      </div>
      <UsuariosPanel roles={[...INVITABLE_ROLES]} />
    </div>
  );
}