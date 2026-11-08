import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  LayoutGrid,
  Search,
  Settings2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminConfigState, setFeature } from "@/lib/actions/configuracion";
import { requirePagePermission } from "@/lib/require-page-permission";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  await requirePagePermission("settings:manage");

  const filters = await searchParams;
  const query = String(filters?.q ?? "").trim().toLowerCase();

  const state = await getAdminConfigState();
  const features = Array.isArray(state.features) ? state.features : [];
  const auditEntries = Array.isArray(state.audits?.entries)
    ? (state.audits.entries as Array<{
        id: string;
        key: string;
        kind: string;
        before?: string | null;
        after?: string | null;
        createdAt: Date | string;
      }>)
    : [];

  const filteredFeatures = features.filter((feature) => {
    if (!query) return true;
    const haystack = `${feature.label} ${feature.description} ${feature.group} ${feature.key}`.toLowerCase();
    return haystack.includes(query);
  });

  const activeTools = filteredFeatures.filter((feature) => feature.enabled).length;
  const optionalTools = filteredFeatures.filter((feature) => feature.kind === "optional").length;
  const groupedFeatures = filteredFeatures.reduce<Record<string, typeof filteredFeatures>>((acc, feature) => {
    acc[feature.group] = [...(acc[feature.group] ?? []), feature];
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Configuración</p>
          <h1 className="display-heading mt-2 text-3xl font-semibold sm:text-4xl">
            Centro de control del negocio
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/configuracion/permisos">
              Gestionar permisos
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="panel-shadow border-border/80 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm text-muted-foreground">Herramientas</CardTitle>
            <LayoutGrid className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filteredFeatures.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Módulos disponibles para activar</p>
          </CardContent>
        </Card>
        <Card className="panel-shadow border-border/80 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm text-muted-foreground">Activas</CardTitle>
            <Zap className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{activeTools}</p>
            <p className="mt-2 text-sm text-muted-foreground">Herramientas visibles hoy</p>
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="w-fit">
            <TabsTrigger value="herramientas">Herramientas</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
          </TabsList>

          <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 shadow-sm">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="text"
              defaultValue={query}
              placeholder="Buscar herramienta o módulo"
              className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onChange={(event) => {
                const value = event.target.value.trim();
                const url = new URL(window.location.href);
                if (value) {
                  url.searchParams.set("q", value);
                } else {
                  url.searchParams.delete("q");
                }
                window.history.replaceState({}, "", url);
              }}
            />
          </div>
        </div>

        <TabsContent value="herramientas" className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/25 px-4 py-3">
            <div className="flex items-center gap-3">
              <Settings2 className="size-5 text-primary" />
              <div>
                <p className="font-semibold">Visibilidad del producto</p>
                <p className="text-xs text-muted-foreground">Núcleo + opcionales · {optionalTools} opciones</p>
              </div>
            </div>
            <Badge variant="secondary">{activeTools}/{features.length} activas</Badge>
          </div>

          {filteredFeatures.length === 0 ? (
            <Card className="panel-shadow border-border/80">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No se encontraron herramientas con ese criterio de búsqueda.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {Object.entries(groupedFeatures).map(([group, groupFeatures]) => (
                <section key={group} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold capitalize">{group}</h2>
                    <Badge variant="outline">{groupFeatures.length}</Badge>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {groupFeatures.map((feature) => (
                      <Card key={feature.key} className="panel-shadow border-border/80">
                        <CardHeader className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-base font-semibold leading-5">{feature.label}</CardTitle>
                            <Badge variant={feature.enabled ? "secondary" : "outline"}>
                              {feature.enabled ? "Activa" : "Inactiva"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{feature.description}</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{feature.kind === "core" ? "Núcleo" : "Opcional"}</span>
                            <span>{feature.defaultEnabled ? "Por defecto" : "Manual"}</span>
                          </div>
                          <form action={setFeature.bind(null, feature.key, !feature.enabled)}>
                            <Button
                              type="submit"
                              className="w-full"
                              variant={feature.enabled ? "secondary" : "default"}
                              disabled={feature.kind === "core"}
                            >
                              {feature.kind === "core"
                                ? "Núcleo protegido"
                                : feature.enabled
                                  ? "Desactivar"
                                  : "Activar"}
                            </Button>
                          </form>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="auditoria" className="space-y-4">
          <Card className="panel-shadow border-border/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xl">Auditoría reciente</CardTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <BellRing className="size-4" />
                <span className="text-xs uppercase tracking-[0.18em]">Registro</span>
              </div>
            </CardHeader>
            <CardContent>
              {auditEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cambios recientes todavía.</p>
              ) : (
                <div className="space-y-3">
                  {auditEntries.slice(0, 12).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border/80 bg-muted/25 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{entry.kind === "feature" ? "Herramienta" : "Permiso"}</p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString("es-SV")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{entry.key}</span> · {entry.before ?? "-"} → {entry.after ?? "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
