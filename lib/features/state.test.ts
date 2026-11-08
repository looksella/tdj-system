import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG, FEATURE_KEYS, FEATURE_BY_KEY } from "./catalog";
import { resolveFeatureStates } from "./state";

describe("catálogo de herramientas", () => {
  it("las dependencias apuntan a herramientas existentes", () => {
    for (const feature of FEATURE_CATALOG) {
      for (const dependency of feature.dependsOn) {
        expect(FEATURE_BY_KEY.has(dependency), `${feature.key} → ${dependency}`).toBe(true);
      }
    }
  });

  it("las esenciales no se pueden apagar desde la tabla", () => {
    const states = resolveFeatureStates(FEATURE_KEYS.map((key) => ({ key, enabled: false })));
    for (const feature of FEATURE_CATALOG) {
      if (feature.kind === "core") expect(states.get(feature.key)).toBe(true);
    }
  });

  it("sin filas usa los valores por defecto", () => {
    const states = resolveFeatureStates([]);
    for (const feature of FEATURE_CATALOG) {
      expect(states.get(feature.key)).toBe(feature.defaultEnabled);
    }
  });

  it("respeta una fila apagada", () => {
    const states = resolveFeatureStates([{ key: "customers", enabled: false }]);
    expect(states.get("customers")).toBe(false);
  });

  it("apagar Compras apaga Pedidos y Producto exprés en cascada", () => {
    const states = resolveFeatureStates([{ key: "purchases", enabled: false }]);
    expect(states.get("supplier-orders")).toBe(false);
    expect(states.get("quick-purchase")).toBe(false);
    // Proveedores es independiente.
    expect(states.get("suppliers")).toBe(true);
  });

  it("apagar Proveedores apaga sus alertas", () => {
    const states = resolveFeatureStates([{ key: "suppliers", enabled: false }]);
    expect(states.get("supplier-alerts")).toBe(false);
  });

  it("exigir asistencia sale de LaborSettings, no de la tabla", () => {
    // Una fila en `app_features` no puede encenderla ni apagarla.
    const storedOff = resolveFeatureStates([
      { key: "require-attendance-to-open-cash", enabled: false },
    ]);
    expect(storedOff.get("require-attendance-to-open-cash")).toBe(true);

    const storedOn = resolveFeatureStates([
      { key: "require-attendance-to-open-cash", enabled: true },
    ]);
    expect(storedOn.get("require-attendance-to-open-cash")).toBe(true);

    const fromSettings = resolveFeatureStates([], { requireAttendanceToOpenCash: false });
    expect(fromSettings.get("require-attendance-to-open-cash")).toBe(false);
  });

  it("exigir asistencia queda apagado si Asistencia está apagada", () => {
    const states = resolveFeatureStates([{ key: "attendance", enabled: false }], {
      requireAttendanceToOpenCash: true,
    });
    expect(states.get("attendance")).toBe(false);
    expect(states.get("require-attendance-to-open-cash")).toBe(false);
  });

  it("el interruptor de entorno apaga el escáner remoto aunque la fila diga que sí", () => {
    const on = resolveFeatureStates([{ key: "remote-scanner-mobile", enabled: true }], {
      env: { NODE_ENV: "test", NEXT_PUBLIC_ENABLE_REMOTE_SCANNER: "true" } as NodeJS.ProcessEnv,
    });
    expect(on.get("remote-scanner-mobile")).toBe(true);

    const off = resolveFeatureStates([{ key: "remote-scanner-mobile", enabled: true }], {
      env: { NODE_ENV: "test", NEXT_PUBLIC_ENABLE_REMOTE_SCANNER: "false" } as NodeJS.ProcessEnv,
    });
    expect(off.get("remote-scanner-mobile")).toBe(false);

    const unset = resolveFeatureStates([{ key: "remote-scanner-mobile", enabled: true }], {
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    });
    expect(unset.get("remote-scanner-mobile")).toBe(true);
  });

  it("con el interruptor de emergencia vuelve a los valores por defecto", () => {
    const states = resolveFeatureStates(
      [
        { key: "customers", enabled: false },
        { key: "reports", enabled: false },
      ],
      { ignoreOverrides: true },
    );
    expect(states.get("customers")).toBe(true);
    expect(states.get("reports")).toBe(true);
  });

  it("una herramienta desconocida no existe", () => {
    expect(FEATURE_BY_KEY.has("no-existe")).toBe(false);
  });
});
