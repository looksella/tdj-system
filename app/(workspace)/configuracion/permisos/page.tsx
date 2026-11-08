import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAdminConfigState,
  getEffectivePermissionMatrixForUser,
  resetUserPermissions,
  setUserPermission,
} from "@/lib/actions/configuracion";
import { PERMISSION_CATALOG } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/require-page-permission";
import { Search } from "lucide-react";

export const metadata = { title: "Permisos" };

export default async function PermisosPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; state?: string | string[] }>;
}) {
  await requirePagePermission("settings:manage");

  const filters = await searchParams;
  const query = String(filters?.q ?? "").trim().toLowerCase();
  const stateFilter = String(filters?.state ?? "all").toLowerCase();

  const state = await getAdminConfigState();
  const userMatrixById = Object.fromEntries(
    await Promise.all(
      (state.users ?? []).map(async (user) => [user.id, await getEffectivePermissionMatrixForUser(user.id)]),
    ),
  );

  const users = (state.users ?? []).filter((user) => {
    const haystack = `${user.email} ${user.role}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    if (!matchesQuery) return false;

    const matrix = (userMatrixById[user.id] ?? {}) as Record<string, { state?: string; effective?: boolean }>;
    const matrixEntries = Object.values(matrix);
    const hasDenied = matrixEntries.some((entry) => entry?.state === "deny");
    const hasGranted = matrixEntries.some(
      (entry) => entry?.effective === true || entry?.state === "allow",
    );

    if (stateFilter === "grant") return hasGranted && !hasDenied;
    if (stateFilter === "deny") return hasDenied;
    return true;
  });

  const groupedPermissions = PERMISSION_CATALOG.reduce<Record<string, typeof PERMISSION_CATALOG>>(
    (acc, permission) => {
      acc[permission.group] = [...(acc[permission.group] ?? []), permission];
      return acc;
    },
    {},
  );

  if (users.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Permisos</p>
          <h1 className="display-heading mt-2 text-3xl font-semibold">Sin usuarios disponibles</h1>
        </div>
        <Card className="panel-shadow border-border/80">
          <CardContent className="py-10 text-sm text-muted-foreground">
            No hay usuarios para administrar desde esta sesión.
          </CardContent>
        </Card>
      </div>
    );
  }

  const firstUserId = users[0]?.id ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Permisos</p>
        <h1 className="display-heading text-3xl font-semibold">Administración de acceso</h1>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 shadow-sm">
          <Search className="size-4 text-muted-foreground" />
          <input
            type="text"
            defaultValue={query}
            placeholder="Buscar usuario o rol"
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

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "Todos" },
            { key: "grant", label: "Con permisos" },
            { key: "deny", label: "Bloqueados" },
          ].map((option) => (
            <Link
              key={option.key}
              href={
                option.key === "all"
                  ? "/configuracion/permisos"
                  : `?state=${option.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`
              }
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                stateFilter === option.key || (option.key === "all" && stateFilter === "all")
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <Tabs defaultValue={firstUserId} className="space-y-5">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {users.map((user) => (
            <TabsTrigger key={user.id} value={user.id} className="min-w-max px-3">
              {user.email}
            </TabsTrigger>
          ))}
        </TabsList>

        {users.map((user) => (
          <TabsContent key={user.id} value={user.id} className="space-y-4">
            <Card className="panel-shadow border-border/80">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">{user.email}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Rol actual: {user.role}</p>
                </div>
                <form action={resetUserPermissions.bind(null, user.id)}>
                  <Button type="submit" variant="outline">
                    Restablecer permisos
                  </Button>
                </form>
              </CardHeader>
              <CardContent className="space-y-5">
                {Object.entries(groupedPermissions).map(([group, permissions]) => {
                  const visiblePermissions = permissions.filter((permission) => {
                    if (!query) return true;
                    const haystack = `${permission.label} ${permission.description} ${permission.key} ${group}`.toLowerCase();
                    return haystack.includes(query);
                  });

                  if (visiblePermissions.length === 0) return null;

                  return (
                    <section key={group} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {group}
                        </h3>
                        <Badge variant="outline">{visiblePermissions.length}</Badge>
                      </div>

                      <div className="space-y-3">
                        {visiblePermissions.map((permission) => (
                          <div
                            key={`${user.id}-${permission.key}`}
                            className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{permission.label}</p>
                                {permission.sensitive && <Badge variant="outline">Sensitivo</Badge>}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">{permission.description}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <form action={setUserPermission.bind(null, user.id, permission.key, "grant")}>
                                <Button type="submit" size="sm" variant="secondary">
                                  Permitir
                                </Button>
                              </form>
                              <form action={setUserPermission.bind(null, user.id, permission.key, "deny")}>
                                <Button type="submit" size="sm" variant="outline">
                                  Bloquear
                                </Button>
                              </form>
                              <form action={setUserPermission.bind(null, user.id, permission.key, null)}>
                                <Button type="submit" size="sm" variant="ghost">
                                  Reset
                                </Button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
