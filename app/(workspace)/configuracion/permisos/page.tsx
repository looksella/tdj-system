import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PermissionsPanel } from "@/components/configuracion/permissions-panel";
import { Button } from "@/components/ui/button";
import { listPermissionUsers } from "@/lib/actions/configuracion";
import { requirePagePermission } from "@/lib/require-page-permission";

export const metadata = { title: "Permisos" };

export default async function PermisosPage() {
  await requirePagePermission("settings:manage");
  const users = await listPermissionUsers();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Permisos</p>
          <h1 className="display-heading mt-2 text-3xl font-semibold">Administración de acceso</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Cada permiso puede quedar como lo define el rol, permitirse o denegarse. Denegar siempre
            gana, y los cambios se aplican en la siguiente solicitud del usuario.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/configuracion">
            <ArrowLeft className="mr-2 size-4" />
            Volver a configuración
          </Link>
        </Button>
      </div>

      <PermissionsPanel users={users} />
    </div>
  );
}
