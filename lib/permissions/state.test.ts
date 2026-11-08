import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, PERMISSION_KEYS, getDefaultPermissionsForRole } from "./catalog";
import { applyDependencyRules, resolveEffectivePermissions } from "./state";

const LEGACY_EMPLOYEE = [
  "attendance:punch",
  "cash:operate",
  "inventory:read",
  "pos:read",
  "sales:create",
  "sales:discount",
];

describe("catálogo de permisos", () => {
  it("incluye todas las claves que scripts/check-permissions-parity.ts congela", () => {
    expect([...PERMISSION_KEYS].sort()).toEqual(
      [
        "assistant:access",
        "attendance:manage",
        "attendance:punch",
        "business:manage",
        "cash:manage",
        "cash:operate",
        "customers:manage",
        "dashboard:read",
        "hr:read",
        "inventory:adjust",
        "inventory:delete",
        "inventory:manage",
        "inventory:read",
        "payroll:manage",
        "pos:read",
        "prices:manage",
        "purchases:manage",
        "reports:read",
        "sales:create",
        "sales:discount",
        "sales:manage",
        "sales:read",
        "sales:void",
        "settings:manage",
        "suppliers:manage",
        "team:manage",
        "users:manage",
      ].sort(),
    );
  });

  it("mantiene el comportamiento histórico del empleado", () => {
    expect([...getDefaultPermissionsForRole("employee")].sort()).toEqual(LEGACY_EMPLOYEE);
  });

  it("no da permisos a un rol desconocido", () => {
    expect(getDefaultPermissionsForRole("customer").size).toBe(0);
    expect(getDefaultPermissionsForRole(null).size).toBe(0);
  });

  it("todo permiso depende de claves existentes", () => {
    const keys = new Set(PERMISSION_KEYS);
    for (const permission of PERMISSION_CATALOG) {
      for (const dependency of permission.dependsOn) {
        expect(keys.has(dependency), `${permission.key} → ${dependency}`).toBe(true);
      }
    }
  });
});

describe("resolución de permisos", () => {
  it("suma los grant y resta los deny", () => {
    const effective = resolveEffectivePermissions("employee", [
      { permission: "customers:manage", effect: "grant" },
      { permission: "pos:read", effect: "deny" },
    ]);
    expect(effective.has("customers:manage")).toBe(true);
    expect(effective.has("pos:read")).toBe(false);
  });

  it("denegar gana sobre permitir el mismo permiso", () => {
    const effective = resolveEffectivePermissions("employee", [
      { permission: "customers:manage", effect: "grant" },
      { permission: "customers:manage", effect: "deny" },
    ]);
    expect(effective.has("customers:manage")).toBe(false);
  });

  it("quita en cascada lo que depende de un permiso ausente", () => {
    const effective = resolveEffectivePermissions("employee", [
      { permission: "sales:create", effect: "deny" },
    ]);
    expect(effective.has("sales:discount")).toBe(false);
    expect(effective.has("pos:read")).toBe(true);
  });

  it("el administrador conserva todo aunque haya overrides", () => {
    const effective = resolveEffectivePermissions(
      "admin",
      [{ permission: "settings:manage", effect: "deny" }],
      { isAdmin: true },
    );
    expect(effective.has("*")).toBe(true);
    expect(effective.has("settings:manage")).toBe(true);
  });

  it("con el interruptor de emergencia ignora los overrides", () => {
    const effective = resolveEffectivePermissions(
      "employee",
      [{ permission: "customers:manage", effect: "grant" }],
      { ignoreOverrides: true },
    );
    expect(effective.has("customers:manage")).toBe(false);
    expect(effective.size).toBe(LEGACY_EMPLOYEE.length);
  });

  it("applyDependencyRules resuelve cadenas sin importar el orden", () => {
    const effective = applyDependencyRules([
      "hr:read",
      "team:manage",
      "users:manage",
      "pos:read",
      "sales:read",
    ]);
    // hr:read → team:manage → users:manage están todos presentes: se mantienen.
    expect(effective.has("hr:read")).toBe(true);
    expect(effective.has("sales:read")).toBe(true);
  });

  it("applyDependencyRules apaga la cadena si falta la base", () => {
    const effective = applyDependencyRules(["hr:read", "team:manage", "sales:read", "pos:read"]);
    expect(effective.has("hr:read")).toBe(false);
    expect(effective.has("team:manage")).toBe(false);
    expect(effective.has("sales:read")).toBe(true);
  });
});
