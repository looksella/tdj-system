import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { FEATURE_CATALOG, FEATURE_BY_KEY } from "@/lib/features/catalog";
import { resolveFeatureStates, type FeatureRow } from "@/lib/features/state";

/**
 * Lectura única por solicitud. Si la tabla no existe todavía o Prisma falla,
 * devuelve `[]`: el sistema usa los valores por defecto (regla 6) y deja el
 * error en consola.
 */
const readFeatureRows = cache(async (): Promise<FeatureRow[]> => {
  try {
    return await db.appFeature.findMany({ select: { key: true, enabled: true } });
  } catch (error) {
    console.error(
      "[features] no se pudo leer app_features; se usan los valores por defecto",
      error,
    );
    return [];
  }
});

const readRequireAttendance = cache(async (): Promise<boolean | undefined> => {
  try {
    const settings = await db.laborSettings.findFirst({
      select: { requireAttendanceToOpenCash: true },
      orderBy: { createdAt: "asc" },
    });
    // `undefined` = no hay fila; el resolvedor aplica el default histórico.
    return settings?.requireAttendanceToOpenCash;
  } catch (error) {
    console.error("[features] no se pudo leer labor_settings; se usa el valor por defecto", error);
    return undefined;
  }
});

export const getFeatureStates = cache(async (): Promise<Map<string, boolean>> => {
  const [rows, requireAttendanceToOpenCash] = await Promise.all([
    readFeatureRows(),
    readRequireAttendance(),
  ]);

  return resolveFeatureStates(rows, {
    requireAttendanceToOpenCash,
    ignoreOverrides: process.env.PERMISSIONS_OVERRIDES_DISABLED === "true",
  });
});

/** Lectura de servidor. Nunca lanza: una herramienta desconocida está apagada. */
export async function isFeatureEnabled(featureKey: string): Promise<boolean> {
  const states = await getFeatureStates();
  return states.get(featureKey) === true;
}

export async function getEnabledFeatureKeys(): Promise<string[]> {
  const states = await getFeatureStates();
  return [...states.entries()].filter(([, enabled]) => enabled).map(([key]) => key);
}

/** Para páginas: redirige a la pantalla de acceso restringido. */
export async function requireFeature(featureKey: string): Promise<void> {
  if (!(await isFeatureEnabled(featureKey))) redirect("/sin-permiso");
}

export async function getFeatureAvailability(featureKey: string) {
  const feature = FEATURE_BY_KEY.get(featureKey);
  if (!feature) return { enabled: false, feature: null };
  return { enabled: await isFeatureEnabled(featureKey), feature };
}

export const FEATURE_KEY_LIST = FEATURE_CATALOG.map((feature) => feature.key);
