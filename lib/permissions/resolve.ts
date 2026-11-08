import { cache } from "react";
import { db } from "@/lib/db";
import { PERMISSION_CATALOG } from "@/lib/permissions/catalog";
import {
  applyDependencyRules,
  isAdminRole,
  resolveEffectivePermissions,
  type PermissionOverride,
} from "@/lib/permissions/state";

export type EffectiveUser = {
  id: string;
  email: string;
  role: string;
};

export type PermissionOverrideRecord = PermissionOverride;

export function hasPermission(permissions: Set<string>, permission: string): boolean {
  return permissions.has("*") || permissions.has(permission);
}

function normalizeOverrides(
  rows: readonly { permission: string; effect: string }[],
): PermissionOverrideRecord[] {
  return rows
    .map((row) => ({
      permission: row.permission,
      effect: row.effect === "deny" ? ("deny" as const) : ("grant" as const),
    }))
    .sort((left, right) => left.permission.localeCompare(right.permission));
}

/**
 * Una sola lectura por solicitud. Si la tabla todavía no existe (despliegue
 * antes de la migración) o Prisma falla, se comporta como si no hubiera
 * overrides: los valores por defecto del rol.
 */
const getUserPermissionOverrides = cache(async (userId: string | null | undefined) => {
  if (!userId) return [] as PermissionOverrideRecord[];

  try {
    const rows = await db.userPermissionOverride.findMany({
      where: { userId },
      select: { permission: true, effect: true },
    });
    return normalizeOverrides(rows);
  } catch (error) {
    console.error("[permissions] no se pudieron leer los overrides del usuario", userId, error);
    return [] as PermissionOverrideRecord[];
  }
});

export async function getEffectivePermissions(
  user: EffectiveUser | null | undefined,
): Promise<Set<string>> {
  const role = (user?.role ?? "customer").trim().toLowerCase();
  const ignoreOverrides = process.env.PERMISSIONS_OVERRIDES_DISABLED === "true";

  if (ignoreOverrides)
    return applyDependencyRules(resolveEffectivePermissions(role, [], { ignoreOverrides: true }));

  if (isAdminRole(role)) {
    return applyDependencyRules(resolveEffectivePermissions(role, [], { isAdmin: true }));
  }

  const overrides = await getUserPermissionOverrides(user?.id ?? null);
  return resolveEffectivePermissions(role, overrides);
}

/** Lista ordenada sin el comodín `*`, para pasarla a componentes de cliente. */
export async function getEffectivePermissionList(
  user: EffectiveUser | null | undefined,
): Promise<string[]> {
  const permissions = await getEffectivePermissions(user);
  if (permissions.has("*")) return PERMISSION_CATALOG.map((permission) => permission.key);
  return [...permissions].sort();
}

/** Para pruebas y para la vista previa de la matriz: no toca la base. */
export function previewPermissions(
  role: string | null | undefined,
  overrides: readonly PermissionOverride[] = [],
): Set<string> {
  return resolveEffectivePermissions(role, overrides);
}
