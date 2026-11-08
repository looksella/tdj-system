import { cache } from "react";
import { db } from "@/lib/db";
import { getDefaultPermissionsForRole, PERMISSION_CATALOG } from "@/lib/permissions/catalog";

export type EffectiveUser = {
  id: string;
  email: string;
  role: string;
};

export type PermissionOverrideRecord = {
  permission: string;
  effect: "grant" | "deny";
};

export function hasPermission(permissions: Set<string>, permission: string): boolean {
  return permissions.has("*") || permissions.has(permission);
}

function sortPermissionOverrides<RecordType extends PermissionOverrideRecord>(
  overrides: RecordType[],
): RecordType[] {
  return [...overrides].sort((left, right) => left.permission.localeCompare(right.permission));
}

const getUserPermissionOverrides = cache(async (userId: string | null | undefined) => {
  if (!userId) return [] as PermissionOverrideRecord[];

  try {
    const rows = await db.userPermissionOverride.findMany({
      where: { userId },
      select: { permission: true, effect: true },
    });
    return sortPermissionOverrides(
      rows.map((row) => ({
        permission: row.permission,
        effect: row.effect === "deny" ? "deny" : "grant",
      })),
    );
  } catch (error) {
    console.error("[permissions] no se pudieron leer overrides para el usuario", userId, error);
    return [] as PermissionOverrideRecord[];
  }
});

function applyDependencyRules(permissions: Set<string>) {
  const next = new Set<string>(permissions);
  const seen = new Set<string>();

  for (const permission of PERMISSION_CATALOG) {
    if (!next.has(permission.key)) continue;

    for (const dependency of permission.dependsOn) {
      if (!next.has(dependency)) {
        next.delete(permission.key);
        break;
      }
    }

    seen.add(permission.key);
  }

  return next;
}

export async function getEffectivePermissions(user: EffectiveUser | null | undefined): Promise<Set<string>> {
  const role = (user?.role ?? "customer").trim().toLowerCase();
  const defaultPermissions = getDefaultPermissionsForRole(role);

  if (process.env.PERMISSIONS_OVERRIDES_DISABLED === "true") {
    return applyDependencyRules(new Set(defaultPermissions));
  }

  if (role === "admin" || role === "developer") {
    const adminPermissions = new Set<string>(PERMISSION_CATALOG.map((permission) => permission.key));
    adminPermissions.add("*");
    return applyDependencyRules(adminPermissions);
  }

  const overrides = await getUserPermissionOverrides(user?.id ?? null);
  const effectivePermissions = new Set(defaultPermissions);

  for (const override of overrides) {
    if (override.effect === "grant") {
      effectivePermissions.add(override.permission);
    } else {
      effectivePermissions.delete(override.permission);
    }
  }

  for (const override of overrides) {
    if (override.effect === "deny") {
      effectivePermissions.delete(override.permission);
    }
  }

  return applyDependencyRules(effectivePermissions);
}
