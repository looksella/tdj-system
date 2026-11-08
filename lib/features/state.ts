import { FEATURE_BY_KEY, FEATURE_CATALOG, getDefaultFeatureStates } from "@/lib/features/catalog";

export type FeatureRow = { key: string; enabled: boolean };

export type FeatureStateOptions = {
  /** Valor de `LaborSettings.requireAttendanceToOpenCash`. */
  requireAttendanceToOpenCash?: boolean;
  /** `PERMISSIONS_OVERRIDES_DISABLED === "true"`: todo vuelve al comportamiento histórico. */
  ignoreOverrides?: boolean;
  env?: NodeJS.ProcessEnv;
};

/**
 * Estado efectivo de cada herramienta: fila guardada (o default), enlace con
 * `LaborSettings`, interruptor maestro por variable de entorno y dependencias.
 * Las herramientas esenciales siempre quedan encendidas.
 */
export function resolveFeatureStates(
  rows: readonly FeatureRow[] = [],
  options: FeatureStateOptions = {},
): Map<string, boolean> {
  const env = options.env ?? process.env;
  const stored = new Map(rows.map((row) => [row.key, row.enabled]));
  const states = new Map<string, boolean>();

  for (const feature of FEATURE_CATALOG) {
    if (feature.kind === "core") {
      states.set(feature.key, true);
      continue;
    }

    let enabled = options.ignoreOverrides
      ? feature.defaultEnabled
      : (stored.get(feature.key) ?? feature.defaultEnabled);

    if (feature.key === "require-attendance-to-open-cash") {
      // La columna es la única fuente de verdad. Si no hay fila (o falla la
      // lectura) manda el default, que reproduce el comportamiento previo.
      enabled = options.requireAttendanceToOpenCash ?? feature.defaultEnabled;
    }

    // El interruptor maestro de entorno existía antes que las herramientas:
    // mandar `"false"` la apaga aunque la fila diga lo contrario.
    if (feature.envGate) {
      const value = env[feature.envGate.variable];
      if (value !== undefined && value !== feature.envGate.value) enabled = false;
    }

    states.set(feature.key, enabled);
  }

  // Dependencias: si la base está apagada, la derivada también, en cascada.
  let changed = true;
  while (changed) {
    changed = false;
    for (const feature of FEATURE_CATALOG) {
      if (!states.get(feature.key)) continue;
      for (const dependencyKey of feature.dependsOn) {
        if (!FEATURE_BY_KEY.has(dependencyKey)) continue;
        if (!states.get(dependencyKey)) {
          states.set(feature.key, false);
          changed = true;
          break;
        }
      }
    }
  }

  return states;
}

export function isDependencyEnabled(
  featureKey: string,
  states: ReadonlyMap<string, boolean>,
): boolean {
  const feature = FEATURE_BY_KEY.get(featureKey);
  if (!feature) return false;
  return feature.dependsOn.every((dependency) => states.get(dependency) === true);
}

export function disabledDependents(
  featureKey: string,
  states: ReadonlyMap<string, boolean>,
): string[] {
  return FEATURE_CATALOG.filter(
    (feature) => states.get(feature.key) && feature.dependsOn.includes(featureKey),
  ).map((feature) => feature.label);
}

export function defaultFeatureStates(): Map<string, boolean> {
  return getDefaultFeatureStates();
}
