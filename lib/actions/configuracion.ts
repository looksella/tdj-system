"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { FEATURE_BY_KEY, FEATURE_CATALOG } from "@/lib/features/catalog";
import { getFeatureStates } from "@/lib/features/resolve";
import { disabledDependents, isDependencyEnabled } from "@/lib/features/state";
import { guardAccion } from "@/lib/guard-autorizacion";
import { PERMISSION_BY_KEY, PERMISSION_CATALOG, PERMISSION_KEYS } from "@/lib/permissions/catalog";
import { isAdminRole, previewPermissions } from "@/lib/permissions/state";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export type FeatureAdminRow = {
  key: string;
  label: string;
  description: string;
  group: string;
  kind: "core" | "optional";
  defaultEnabled: boolean;
  enabled: boolean;
  dependsOn: string[];
  dependencyLabels: string[];
  dependentLabels: string[];
};

export type PermissionState = "role" | "allow" | "deny";

export type PermissionMatrixRow = {
  key: string;
  label: string;
  description: string;
  group: string;
  sensitive: boolean;
  state: PermissionState;
  effective: boolean;
  inherited: boolean;
  dependsOn: string[];
  locked: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  canEdit: boolean;
  overrides: number;
  matrix: PermissionMatrixRow[];
};

export type ActionResult = { ok: boolean; message: string };

const SIN_CONFIG = "No tenés permiso para administrar la configuración.";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta la configuración de Supabase en el servidor.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function actorOrThrow() {
  const actor = await getEffectiveUser();
  if (!actor) throw new Error("Tu sesión expiró. Volvé a entrar.");
  return actor;
}

/** Estado de herramientas + catálogo de permisos para la pantalla. */
export async function getAdminConfigState() {
  const denial = await guardAccion("settings:manage");
  if (denial) return { features: [] as FeatureAdminRow[], permissionCatalog: [] };

  const states = await getFeatureStates();
  const features: FeatureAdminRow[] = FEATURE_CATALOG.map((feature) => ({
    key: feature.key,
    label: feature.label,
    description: feature.description,
    group: feature.group,
    kind: feature.kind,
    defaultEnabled: feature.defaultEnabled,
    enabled: states.get(feature.key) ?? feature.defaultEnabled,
    dependsOn: feature.dependsOn,
    dependencyLabels: feature.dependsOn
      .map((dependency) => FEATURE_BY_KEY.get(dependency)?.label ?? dependency)
      .filter(Boolean),
    dependentLabels: FEATURE_CATALOG.filter(
      (candidate) => candidate.dependsOn.includes(feature.key) && states.get(candidate.key),
    ).map((candidate) => candidate.label),
  })).sort((left, right) => left.group.localeCompare(right.group));

  return { features, permissionCatalog: PERMISSION_CATALOG };
}

/** Lista de usuarios con su matriz efectiva; una sola consulta de overrides. */
export async function listPermissionUsers(): Promise<AdminUser[]> {
  const denial = await guardAccion("settings:manage");
  if (denial) return [];

  const actor = await actorOrThrow();
  const isDeveloper = actor.role === "developer";

  let users: { id: string; email: string; role: string }[] = [];
  try {
    const service = adminClient();
    const { data, error } = await service.auth.admin.listUsers({ perPage: 200 });
    if (error) {
      console.error("[configuracion] no se pudo listar usuarios", error.message);
      return [];
    }
    users = data.users
      .map((entry) => ({
        id: entry.id,
        email: entry.email ?? "",
        role: (entry.app_metadata?.role as string | undefined) ?? "customer",
      }))
      .filter((entry) => entry.email && (isDeveloper || entry.role !== "developer"));
  } catch (error) {
    console.error("[configuracion] no se pudo crear el cliente de administración", error);
    return [];
  }

  let overridesByUser = new Map<string, { permission: string; effect: string }[]>();
  try {
    const rows = await db.userPermissionOverride.findMany({
      where: { userId: { in: users.map((user) => user.id) } },
      select: { userId: true, permission: true, effect: true },
    });
    overridesByUser = rows.reduce((acc, row) => {
      const list = acc.get(row.userId) ?? [];
      list.push({ permission: row.permission, effect: row.effect });
      acc.set(row.userId, list);
      return acc;
    }, new Map<string, { permission: string; effect: string }[]>());
  } catch (error) {
    console.error(
      "[configuracion] no se pudieron leer los overrides; se muestran los del rol",
      error,
    );
  }

  return users.map((user) => {
    const overrides = overridesByUser.get(user.id) ?? [];
    const effective = previewPermissions(
      user.role,
      overrides.map((override) => ({
        permission: override.permission,
        effect: override.effect === "deny" ? ("deny" as const) : ("grant" as const),
      })),
    );
    const matrix = PERMISSION_CATALOG.map((permission) => {
      const override = overrides.find((row) => row.permission === permission.key);
      return {
        key: permission.key,
        label: permission.label,
        description: permission.description,
        group: permission.group,
        sensitive: permission.sensitive,
        state: override ? (override.effect === "deny" ? "deny" : "allow") : "role",
        effective: isAdminRole(user.role) ? true : effective.has(permission.key),
        inherited: permission.defaultRoles.includes((user.role ?? "").toLowerCase()),
        dependsOn: permission.dependsOn,
        locked: isAdminRole(user.role),
      } satisfies PermissionMatrixRow;
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      canEdit: !isAdminRole(user.role) && user.role !== "customer",
      overrides: overrides.length,
      matrix,
    };
  });
}

export async function listAuditLog(page = 1, take = 20) {
  const denial = await guardAccion("settings:manage");
  if (denial) throw new Error(denial);

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeTake = Math.min(Math.max(Math.floor(take), 1), 100);

  try {
    const [entries, total] = await Promise.all([
      db.permissionAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safeTake,
        take: safeTake,
      }),
      db.permissionAuditLog.count(),
    ]);
    return { entries, total, page: safePage, take: safeTake };
  } catch (error) {
    console.error("[configuracion] no se pudo leer el historial", error);
    return { entries: [], total: 0, page: safePage, take: safeTake };
  }
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  data: {
    actorId: string;
    targetUserId?: string | null;
    kind: "permission" | "feature";
    key: string;
    before: string | null;
    after: string | null;
  },
) {
  await tx.permissionAuditLog.create({ data });
}

export async function setFeature(key: string, enabled: boolean): Promise<ActionResult> {
  const denial = await guardAccion("settings:manage");
  if (denial) return { ok: false, message: denial || SIN_CONFIG };

  const actor = await actorOrThrow();
  if (!isAdminRole(actor.role)) {
    return { ok: false, message: "Solo un administrador puede cambiar herramientas." };
  }

  const feature = FEATURE_BY_KEY.get(key);
  if (!feature) return { ok: false, message: "Esa herramienta no existe." };
  if (feature.kind === "core") {
    return { ok: false, message: `${feature.label} es esencial y no se puede apagar.` };
  }

  const states = await getFeatureStates();
  if (enabled && !isDependencyEnabled(key, states)) {
    const missing = feature.dependsOn
      .filter((dependency) => !states.get(dependency))
      .map((dependency) => FEATURE_BY_KEY.get(dependency)?.label ?? dependency);
    return { ok: false, message: `Activá primero: ${missing.join(", ")}.` };
  }

  const dependents = enabled ? [] : disabledDependents(key, states);

  try {
    await db.$transaction(async (tx) => {
      if (key === "require-attendance-to-open-cash") {
        const current = await tx.laborSettings.findFirst({
          select: { id: true, requireAttendanceToOpenCash: true },
          orderBy: { createdAt: "asc" },
        });
        if (current) {
          await tx.laborSettings.update({
            where: { id: current.id },
            data: { requireAttendanceToOpenCash: enabled },
          });
        } else {
          await tx.laborSettings.create({ data: { requireAttendanceToOpenCash: enabled } });
        }
        await writeAudit(tx, {
          actorId: actor.id,
          kind: "feature",
          key,
          before: String(current?.requireAttendanceToOpenCash ?? true),
          after: String(enabled),
        });
        return;
      }

      const before = await tx.appFeature.findUnique({ where: { key }, select: { enabled: true } });
      await tx.appFeature.upsert({
        where: { key },
        update: { enabled, updatedBy: actor.id },
        create: { key, enabled, updatedBy: actor.id },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        kind: "feature",
        key,
        before: String(before?.enabled ?? feature.defaultEnabled),
        after: String(enabled),
      });
    });
  } catch (error) {
    console.error("[configuracion] no se pudo guardar la herramienta", key, error);
    return { ok: false, message: "No se pudo guardar el cambio. Intentá de nuevo." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/configuracion");
  return {
    ok: true,
    message: enabled
      ? `${feature.label} quedó activa.`
      : dependents.length > 0
        ? `${feature.label} quedó apagada. También se apagan: ${dependents.join(", ")}.`
        : `${feature.label} quedó apagada. Los datos siguen guardados.`,
  };
}

type PermissionChange = "grant" | "deny" | null;

function validChanges(changes: Record<string, PermissionChange>) {
  const entries = Object.entries(changes ?? {});
  for (const [key, effect] of entries) {
    if (!PERMISSION_BY_KEY.has(key))
      throw new Error(`El permiso "${key}" no existe en el catálogo.`);
    if (effect !== null && effect !== "grant" && effect !== "deny") {
      throw new Error("El estado del permiso no es válido.");
    }
  }
  return entries;
}

/** Guarda un lote de cambios y audita cada uno en la misma transacción. */
export async function saveUserPermissions(
  userId: string,
  changes: Record<string, PermissionChange>,
): Promise<ActionResult> {
  const denial = await guardAccion("settings:manage");
  if (denial) return { ok: false, message: denial || SIN_CONFIG };

  const actor = await actorOrThrow();

  if (!isAdminRole(actor.role)) {
    return { ok: false, message: "Solo un administrador puede cambiar permisos." };
  }
  if (userId === actor.id) {
    return { ok: false, message: "No podés cambiar tus propios permisos." };
  }

  let entries: [string, PermissionChange][];
  try {
    entries = validChanges(changes);
    if (entries.some(([key, effect]) => key === "settings:manage" && effect === "grant")) {
      return { ok: false, message: "El acceso a Configuración es solo del rol administrador." };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Datos inválidos." };
  }
  if (entries.length === 0) return { ok: false, message: "No hay cambios para guardar." };
  if (!userId) return { ok: false, message: "Elegí un usuario." };

  let targetRole = "";
  let targetEmail = "";
  try {
    const { data, error } = await adminClient().auth.admin.getUserById(userId);
    if (error || !data?.user) return { ok: false, message: "No se encontró el usuario." };
    targetRole = (data.user.app_metadata?.role as string | undefined) ?? "customer";
    targetEmail = data.user.email ?? userId;
  } catch (error) {
    console.error("[configuracion] no se pudo leer el usuario", userId, error);
    return { ok: false, message: "No se pudo verificar el usuario." };
  }

  if (isAdminRole(targetRole)) {
    return {
      ok: false,
      message: "El rol administrador conserva todos los permisos y no se edita acá.",
    };
  }
  if (targetRole === "customer") {
    return { ok: false, message: "Un usuario sin rol del sistema no puede recibir permisos." };
  }

  try {
    await db.$transaction(async (tx) => {
      for (const [permission, effect] of entries) {
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

        await writeAudit(tx, {
          actorId: actor.id,
          targetUserId: userId,
          kind: "permission",
          key: permission,
          before: before?.effect ?? null,
          after: effect,
        });
      }
    });
  } catch (error) {
    console.error("[configuracion] no se pudieron guardar los permisos", userId, error);
    return { ok: false, message: "No se pudieron guardar los cambios. Intentá de nuevo." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/configuracion/permisos");
  return {
    ok: true,
    message: `Permisos de ${targetEmail} actualizados (${entries.length} ${entries.length === 1 ? "cambio" : "cambios"}).`,
  };
}

export async function setUserPermission(
  userId: string,
  permission: string,
  effect: PermissionChange,
): Promise<ActionResult> {
  if (!PERMISSION_KEYS.includes(permission)) {
    return { ok: false, message: "Ese permiso no existe en el catálogo." };
  }
  return saveUserPermissions(userId, { [permission]: effect });
}

export async function resetUserPermissions(userId: string): Promise<ActionResult> {
  const denial = await guardAccion("settings:manage");
  if (denial) return { ok: false, message: denial || SIN_CONFIG };
  const actor = await actorOrThrow();

  if (!isAdminRole(actor.role)) {
    return { ok: false, message: "Solo un administrador puede restablecer permisos." };
  }
  if (userId === actor.id) {
    return { ok: false, message: "No podés restablecer tus propios permisos." };
  }

  try {
    const { data, error } = await adminClient().auth.admin.getUserById(userId);
    if (error || !data?.user) return { ok: false, message: "No se encontró el usuario." };
    const role = (data.user.app_metadata?.role as string | undefined) ?? "customer";
    if (isAdminRole(role)) {
      return { ok: false, message: "Los administradores no tienen overrides que restablecer." };
    }

    await db.$transaction(async (tx) => {
      const before = await tx.userPermissionOverride.findMany({
        where: { userId },
        select: { permission: true, effect: true },
      });
      if (before.length === 0) return;
      await tx.userPermissionOverride.deleteMany({ where: { userId } });
      await writeAudit(tx, {
        actorId: actor.id,
        targetUserId: userId,
        kind: "permission",
        key: "__reset__",
        before: JSON.stringify(before),
        after: "[]",
      });
    });
  } catch (error) {
    console.error("[configuracion] no se pudieron restablecer los permisos", userId, error);
    return { ok: false, message: "No se pudieron restablecer los permisos." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/configuracion/permisos");
  return { ok: true, message: "El usuario volvió a los permisos de su rol." };
}
