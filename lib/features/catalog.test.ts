import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";
import { FEATURE_CATALOG } from "./catalog";

describe("herramientas vs permisos", () => {
  it("cada permiso de una herramienta existe en el catálogo de permisos", () => {
    for (const feature of FEATURE_CATALOG) {
      for (const permission of feature.permissions) {
        expect(PERMISSION_KEYS, `${feature.key} → ${permission}`).toContain(permission);
      }
    }
  });
});