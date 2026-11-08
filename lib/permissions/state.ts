import { PERMISSION_CATALOG, getDefaultPermissionsForRole } from "@/lib/permissions/catalog";

export type PermissionOverride = { permission: string; effect: "grant" | "deny" };

/**
 * Quita los permisos cuya dependencia no está presente. Se repite hasta que no
 * cambia nada: si A depende de B y B de C, la ausencia de C también apaga A,
 * sin importar el orden del catálogo.
 */
export function applyDependencyRules(permissions: Iterable<string>): Set<string> {
  const effective = new Set(permissions);
  let changed = true;

  while (changed) {
    changed = false;
    for (const permission of PERMISSION_CATALOG) {
      if (!effective.has(permission.key)) continue;
      if (permission.dependsOn.some((dependency) => !effective.has(dependency))) {
        effective.delete(permission.key);
        changed = true;
      }
    }
  }

  return effective;
}

/**
 * Defaults del rol + overrides. Denegar siempre gana sobre permitir, y el
 * administrador nunca pierde permisos (el llamador ni siquiera pasa overrides
 * para ese rol).
 */
export function resolveEffectivePermissions(
  role: string | null | undefined,
  overrides: readonly PermissionOverride[] = [],
  options: { ignoreOverrides?: boolean; isAdmin?: boolean } = {},
): Set<string> {
  const defaults = getDefaultPermissionsForRole(role);
  if (options.ignoreOverrides || options.isAdmin) {
    return applyDependencyRules(defaults);
  }

  const effective = new Set(defaults);
  for (const override of overrides) {
    if (override.effect === "grant") effective.add(override.permission);
  }
  for (const override of overrides) {
    if (override.effect === "deny") effective.delete(override.permission);
  }

  return applyDependencyRules(effective);
}

/** Alias con el nombre que usa la administración para la vista previa. */
export const previewPermissions = resolveEffectivePermissions;

export function isAdminRole(role: string | null | undefined): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "developer";
}
