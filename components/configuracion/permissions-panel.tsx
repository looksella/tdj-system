"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  resetUserPermissions,
  saveUserPermissions,
  type AdminUser,
  type PermissionMatrixRow,
} from "@/lib/actions/configuracion";
import { cn } from "@/lib/utils";

type Draft = Record<string, "role" | "allow" | "deny">;
type Drafts = Record<string, Draft>;

function resolveEffective(rows: PermissionMatrixRow[], draft: Draft): Set<string> {
  const allowed = new Set<string>();
  for (const row of rows) {
    const state = draft[row.key] ?? row.state;
    if (row.locked || state === "allow" || (state === "role" && row.inherited)) {
      allowed.add(row.key);
    }
  }
  for (const row of rows) {
    if ((draft[row.key] ?? row.state) === "deny") allowed.delete(row.key);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!allowed.has(row.key)) continue;
      if (row.dependsOn.some((dependency) => !allowed.has(dependency))) {
        allowed.delete(row.key);
        changed = true;
      }
    }
  }

  return allowed;
}

function changedEntries(rows: PermissionMatrixRow[], draft: Draft) {
  return rows
    .map((row) => {
      const state = draft[row.key] ?? row.state;
      if (state === row.state) return null;
      return {
        key: row.key,
        effect:
          state === "allow" ? ("grant" as const) : state === "deny" ? ("deny" as const) : null,
        label: row.label,
        sensitive: row.sensitive,
        before: row.state,
        after: state,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export function PermissionsPanel({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const term = query.trim().toLowerCase();
  const filteredUsers = term
    ? users.filter((user) => `${user.email} ${user.role}`.toLowerCase().includes(term))
    : users;

  const selected = users.find((user) => user.id === selectedId) ?? null;
  const draft = selected ? (drafts[selected.id] ?? {}) : {};
  const changed = selected ? changedEntries(selected.matrix, draft) : [];
  const effective = selected
    ? selected.canEdit
      ? resolveEffective(selected.matrix, draft)
      : new Set(selected.matrix.map((row) => row.key))
    : new Set<string>();

  const groups: [string, PermissionMatrixRow[]][] = [];
  if (selected) {
    const map = new Map<string, PermissionMatrixRow[]>();
    for (const row of selected.matrix) {
      map.set(row.group, [...(map.get(row.group) ?? []), row]);
    }
    groups.push(...map.entries());
  }

  function setState(permission: string, state: "role" | "allow" | "deny") {
    if (!selected || !selected.canEdit) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: { ...(current[selected.id] ?? {}), [permission]: state },
    }));
  }

  function save() {
    if (!selected || changed.length === 0) return;
    setConfirming(true);
  }

  function commit() {
    if (!selected) return;
    const payload = Object.fromEntries(changed.map((entry) => [entry.key, entry.effect]));
    setConfirming(false);
    startTransition(async () => {
      const result = await saveUserPermissions(selected.id, payload);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDrafts((current) => ({ ...current, [selected.id]: {} }));
      router.refresh();
    });
  }

  function reset() {
    if (!selected) return;
    if (!window.confirm(`¿Restablecer los permisos de ${selected.email} a los de su rol?`)) return;
    startTransition(async () => {
      const result = await resetUserPermissions(selected.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDrafts((current) => ({ ...current, [selected.id]: {} }));
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <Card className="panel-shadow border-border/80">
        <CardContent className="py-10 text-sm text-muted-foreground">
          No hay usuarios para administrar, o falta `SUPABASE_SERVICE_ROLE_KEY` en el servidor.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 shadow-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por correo o rol"
          className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Buscar usuario"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <Card className="panel-shadow h-fit border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-[0.12em] text-muted-foreground">
              Usuarios
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-1 overflow-y-auto p-2">
            {filteredUsers.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">Sin coincidencias.</p>
            )}
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedId(user.id)}
                aria-pressed={user.id === selectedId}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left transition-colors",
                  user.id === selectedId ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                )}
              >
                <span className="block truncate text-sm font-medium">{user.email}</span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {user.role}
                  {user.overrides > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {user.overrides} ajuste{user.overrides === 1 ? "" : "s"}
                    </Badge>
                  )}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card className="panel-shadow border-border/80">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="truncate text-lg">{selected.email}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rol actual: <span className="font-medium text-foreground">{selected.role}</span>
                  {!selected.canEdit && " · los administradores conservan todos los permisos"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={pending || !selected.canEdit || selected.overrides === 0}
              >
                Restablecer a los del rol
              </Button>
            </CardHeader>

            <CardContent className="space-y-6">
              {groups.map(([group, rows]) => (
                <section key={group} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group}
                  </h3>
                  <div className="space-y-2">
                    {rows.map((row) => {
                      const state = draft[row.key] ?? row.state;
                      const isEffective = effective.has(row.key);
                      return (
                        <div
                          key={row.key}
                          className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{row.label}</p>
                              {row.sensitive && <Badge variant="outline">Sensible</Badge>}
                              <Badge variant={isEffective ? "secondary" : "outline"}>
                                {isEffective ? "Permitido" : "Denegado"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                            {!isEffective && row.dependsOn.length > 0 && (
                              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                Falta una dependencia de este permiso.
                              </p>
                            )}
                          </div>

                          <div
                            role="group"
                            aria-label={`Estado de ${row.label}`}
                            className="flex shrink-0 overflow-hidden rounded-lg border border-border"
                          >
                            {(
                              [
                                { value: "role", label: "Según su rol" },
                                { value: "allow", label: "Permitir" },
                                { value: "deny", label: "Denegar" },
                              ] as const
                            ).map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={state === option.value}
                                disabled={pending || !selected.canEdit}
                                onClick={() => setState(row.key, option.value)}
                                className={cn(
                                  "px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                  state === option.value
                                    ? option.value === "deny"
                                      ? "bg-destructive text-white"
                                      : "bg-primary text-primary-foreground"
                                    : "bg-background text-muted-foreground hover:bg-muted",
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </CardContent>

            <div className="flex flex-col gap-3 border-t border-border/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {changed.length === 0
                  ? "Sin cambios pendientes."
                  : `${changed.length} cambio${changed.length === 1 ? "" : "s"} sin guardar.`}
              </p>
              <Button type="button" onClick={save} disabled={pending || changed.length === 0}>
                Guardar cambios
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cambios de permisos</DialogTitle>
            <DialogDescription>
              {changed.some((entry) => entry.sensitive)
                ? "Hay cambios sobre permisos sensibles (caja, planilla, equipo o configuración). Revisá el resumen antes de guardar."
                : "Revisá el resumen de los cambios antes de guardar."}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {changed.map((entry) => (
                <li key={entry.key} className="rounded-lg bg-muted/40 px-3 py-2">
                  <span className="font-medium">{entry.label}</span>
                  {entry.sensitive && (
                    <Badge variant="outline" className="ml-2">
                      Sensible
                    </Badge>
                  )}
                  :{" "}
                  {entry.before === "role"
                    ? "según su rol"
                    : entry.before === "allow"
                      ? "permitido"
                      : "denegado"}{" "}
                  →{" "}
                  {entry.after === "role"
                    ? "según su rol"
                    : entry.after === "allow"
                      ? "permitido"
                      : "denegado"}
                </li>
              ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={commit} disabled={pending}>
              Confirmar y guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
