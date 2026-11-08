import Link from "next/link";
import { ArrowRight, LayoutGrid, ShieldCheck, Zap } from "lucide-react";
import { AuditPanel } from "@/components/configuracion/audit-panel";
import { FeaturesPanel } from "@/components/configuracion/features-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminConfigState, listAuditLog } from "@/lib/actions/configuracion";
import { requirePagePermission } from "@/lib/require-page-permission";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  await requirePagePermission("settings:manage");

  const [state, audit] = await Promise.all([getAdminConfigState(), listAuditLog(1, 20)]);
  const features = state.features ?? [];
  const activeTools = features.filter((feature) => feature.enabled).length;
  const optionalTools = features.filter((feature) => feature.kind === "optional").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Configuración
          </p>
          <h1 className="display-heading mt-2 text-3xl font-semibold sm:text-4xl">
            Centro de control del negocio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Encendé o apagá herramientas y administrá los permisos de cada usuario. Apagar una
            herramienta nunca borra datos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/configuracion/permisos">
            Gestionar permisos
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="panel-shadow border-border/80 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm text-muted-foreground">Herramientas</CardTitle>
            <LayoutGrid className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{features.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Módulos del sistema</p>
          </CardContent>
        </Card>
        <Card className="panel-shadow border-border/80 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm text-muted-foreground">Activas</CardTitle>
            <Zap className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{activeTools}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {optionalTools} opcionales configurables
            </p>
          </CardContent>
        </Card>
        <Card className="panel-shadow border-border/80 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm text-muted-foreground">Permisos</CardTitle>
            <ShieldCheck className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{state.permissionCatalog?.length ?? 0}</p>
            <p className="mt-2 text-sm text-muted-foreground">Catalogados en el sistema</p>
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="herramientas" className="space-y-5">
        <TabsList className="w-fit">
          <TabsTrigger value="herramientas">Herramientas</TabsTrigger>
          <TabsTrigger value="auditoria">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="herramientas" className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/25 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Las herramientas esenciales no se pueden apagar. Las dependencias se respetan en
              cascada.
            </p>
            <Badge variant="secondary">
              {activeTools}/{features.length} activas
            </Badge>
          </div>
          <FeaturesPanel features={features} />
        </TabsContent>

        <TabsContent value="auditoria">
          <AuditPanel initial={audit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
