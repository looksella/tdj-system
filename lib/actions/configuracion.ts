"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { FEATURE_CATALOG, FEATURE_BY_KEY } from "@/lib/features/catalog";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@/lib/permissions/catalog";
import { getEffectivePermissions } from "@/lib/permissions/resolve";
import { guardAccion } from "@/lib/guard-autorizacion";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import { isAllowed } from "@/lib/auth-helpers";

export type FeatureStateEntry = {
  key: string;
  enabled: boolean;
  label: string;
  description: string;
  group: string;
  kind: "core" | "optional";
  defaultEnabled: boolean;
  dependsOn: string[];
  permissions: string[];
};

export type PermissionAdminRow = {
  key: string;
  label: string;
  description: string;
  group: string;
  sensitive: boolean;
  dependsOn: string[];
  defaultRoles: readonly string[];
};

export async function getAdminConfigState() {
  const denial = await guardAccion("settings:manage");
  if (denial) {
    return { features: [], users: [], audits: [], permissionCatalog: [] as PermissionAdminRow[] };
  }

  const features = await Promise.all(
    FEATURE_CATALOG.map(async (feature) => {
      try {
        const row = await db.appFeature.findUnique({
          where: { key: feature.key },
          select: { enabled: true },
        });
        return {
          key: feature.key,
          enabled: row?.enabled ?? feature.defaultEnabled,
          label: feature.label,
          description: feature.description,
          group: feature.group,
          kind: feature.kind,
          defaultEnabled: feature.defaultEnabled,
          dependsOn: feature.dependsOn,
          permissions: feature.permissions,
        } satisfies FeatureStateEntry;
      } catch (error) {
        console.error("[configuracion] no se pudo leer app_features", feature.key, error);
        return {
          key: feature.key,
          enabled: feature.defaultEnabled,
          label: feature.label,
          description: feature.description,
          group: feature.group,
          kind: feature.kind,
          defaultEnabled: feature.defaultEnabled,
          dependsOn: feature.dependsOn,
          permissions: feature.permissions,
        } satisfies FeatureStateEntry;
      }
    }),
  );

  const users = await listUsersForAdmin();
  const audits = await listAuditLog(1, 20);

  return {
    features,
    users,
    audits,
    permissionCatalog: PERMISSION_CATALOG,
  };
}

async function listUsersForAdmin() {
  const user = await getEffectiveUser();
  if (!user || !isAllowed(user.role, "settings:manage")) return [];

  try {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await service.auth.admin.listUsers();
    if (error) {
      console.error("[configuracion] lista de usuarios fallida", error.message);
      return [];
    }

    return data.users
      .map((entry) => ({
        id: entry.id,
        email: entry.email ?? "",
        role: (entry.app_metadata?.role as string | undefined) ?? "customer",
      }))
      .filter((entry) => entry.email);
  } catch (error) {
    console.error("[configuracion] no se pudo listar usuarios", error);
    return [];
  }
}

export async function listAuditLog(page = 1, take = 20) {
  const denial = await guardAccion("settings:manage");
  if (denial) throw new Error(denial);

  try {
    const [entries, total] = await Promise.all([
      db.permissionAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      db.permissionAuditLog.count(),
    ]);

    return { entries, total, page, take };
  } catch (error) {
    console.error("[configuracion] no se pudo leer historial de permisos", error);
    return { entries: [], total: 0, page, take };
  }
}

export async function setFeature(key: string, enabled: boolean) {
  const denial = await guardAccion("settings:manage");
  if (denial) throw new Error(denial);

  const feature = FEATURE_BY_KEY.get(key);
  if (!feature) throw new Error("La herramienta no existe.");
  if (feature.kind === "core") throw new Error("La herramienta esencial no se puede apagar.");

  const actor = await getEffectiveUser();
  if (!actor) throw new Error("Tu sesión expiró.");

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.appFeature.findUnique({ where: { key }, select: { enabled: true } });
      await tx.appFeature.upsert({
        where: { key },
        update: { enabled, updatedBy: actor.id },
        create: { key, enabled, updatedBy: actor.id },
      });
      await tx.permissionAuditLog.create({
        data: {
          actorId: actor.id,
          kind: "feature",
          key,
          before: before?.enabled ? "true" : "false",
          after: String(enabled),
        },
      });
    });
  } catch (error) {
    console.error("[configuracion] no se pudo guardar la herramienta", key, error);
    throw new Error("No se pudo guardar la configuración de la herramienta.");
  }

  revalidatePath("/configuracion");
  revalidatePath("/configuracion/permisos");
}

export async function setUserPermission(
  userId: string,
  permission: string,
  effect: "grant" | "deny" | null,
) {
  const denial = await guardAccion("settings:manage");
  if (denial) throw new Error(denial);

  if (!PERMISSION_KEYS.includes(permission)) {
    throw new Error("Ese permiso no existe en el catálogo.");
  }

  const actor = await getEffectiveUser();
  if (!actor) throw new Error("Tu sesión expiró.");

  try {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: targetUser, error: userError } = await service.auth.admin.getUserById(userId);
    if (userError || !targetUser) {
      throw new Error("No se encontró el usuario.");
    }

    if (targetUser.user.id === actor.id && permission === "settings:manage") {
      throw new Error("No podés quitarte tu acceso a la configuración.");
    }

    if ((targetUser.user.app_metadata?.role as string | undefined) === "admin") {
      throw new Error("No se puede tocar el rol administrador desde aquí.");
    }

    await db.$transaction(async (tx) => {
      const before = await tx.userPermissionOverride.findUnique({
        where: { userId_permission: { userId, permission } },
        select: { effect: true },
      });

      if (effect === null) {
        await tx.userPermissionOverride.deleteMany({ where: { userId, permission } });
      } else {
        await tx.userPermissionOverride.upsert({
          where: { userId_permission: { userId, permission } },
          update: { effect, createdBy: actor.id },
          create: { userId, permission, effect, createdBy: actor.id },
        });
      }

      await tx.permissionAuditLog.create({
        data: {
          actorId: actor.id,
          targetUserId: userId,
          kind: "permission",
          key: permission,
          before: before?.effect ?? null,
          after: effect,
        },
      });
    });
  } catch (error) {
    console.error("[configuracion] no se pudo guardar permiso", userId, permission, error);
    throw new Error(error instanceof Error ? error.message : "No se pudo guardar el permiso.");
  }

  revalidatePath("/configuracion");
  revalidatePath("/configuracion/permisos");
}

export async function resetUserPermissions(userId: string) {
  const denial = await guardAccion("settings:manage");
  if (denial) throw new Error(denial);

  const actor = await getEffectiveUser();
  if (!actor) throw new Error("Tu sesión expiró.");

  try {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: targetUser, error: userError } = await service.auth.admin.getUserById(userId);
    if (userError || !targetUser) throw new Error("No se encontró el usuario.");

    if (targetUser.user.id === actor.id && (targetUser.user.app_metadata?.role as string | undefined) === "admin") {
      throw new Error("No podés limpiar tus propios permisos de configuración.");
    }

    await db.$transaction(async (tx) => {
      const before = await tx.userPermissionOverride.findMany({
        where: { userId },
        select: { permission: true, effect: true },
      });
      await tx.userPermissionOverride.deleteMany({ where: { userId } });
      await tx.permissionAuditLog.create({
        data: {
          actorId: actor.id,
          targetUserId: userId,
          kind: "permission",
          key: "__reset__",
          before: JSON.stringify(before),
          after: "[]",
        },
      });
    });
  } catch (error) {
    console.error("[configuracion] no se pudo resetear permisos del usuario", userId, error);
    throw new Error(error instanceof Error ? error.message : "No se pudo resetear permisos del usuario.");
  }

  revalidatePath("/configuracion");
  revalidatePath("/configuracion/permisos");
}

export async function getEffectivePermissionMatrixForUser(userId: string) {
  const denial = await guardAccion("settings:manage");
  if (denial) return {};

  try {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: targetUser, error } = await service.auth.admin.getUserById(userId);
    if (error || !targetUser) return {};

    const role = (targetUser.user.app_metadata?.role as string | undefined) ?? "customer";
    const overrides = await db.userPermissionOverride.findMany({
      where: { userId },
      select: { permission: true, effect: true },
    });
    const permissions = await getEffectivePermissions({
      id: userId,
      email: targetUser.user.email ?? "",
      role,
    });

    const matrix = Object.fromEntries(
      PERMISSION_CATALOG.map((permission) => {
        const current = overrides.find((row) => row.permission === permission.key);
        const effective = permissions.has(permission.key) || permissions.has("*");
        const state = current?.effect === "grant" ? "allow" : current?.effect === "deny" ? "deny" : "role";
        return [permission.key, { state, effective, sensitive: permission.sensitive }];
      }),
    );

    return matrix;
  } catch (error) {
    console.error("[configuracion] no se pudo calcular la matriz del usuario", userId, error);
    return {};
  }
}
