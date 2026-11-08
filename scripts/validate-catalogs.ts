import { FEATURE_CATALOG, FEATURE_KEYS } from "../lib/features/catalog";
import { PERMISSION_KEYS } from "../lib/permissions/catalog";

const permissionKeysSet = new Set(PERMISSION_KEYS);
const featureKeysSet = new Set(FEATURE_KEYS);

let hasErrors = false;

console.log("🔍 Validando integridad de catálogos...");

for (const feature of FEATURE_CATALOG) {
  // Validar dependencias de herramientas
  for (const dep of feature.dependsOn) {
    if (!featureKeysSet.has(dep)) {
      console.error(
        `❌ La herramienta "${feature.key}" depende de "${dep}", que NO existe en FEATURE_CATALOG.`,
      );
      hasErrors = true;
    }
  }
  // Validar permisos requeridos
  for (const perm of feature.permissions) {
    if (!permissionKeysSet.has(perm)) {
      console.error(
        `❌ La herramienta "${feature.key}" requiere el permiso "${perm}", que NO existe en PERMISSION_CATALOG.`,
      );
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  console.error("🚨 Validación de catálogos FALLIDA. Revisá los errores arriba.");
  process.exit(1);
} else {
  console.log(
    "✅ Validación de catálogos EXITOSA: todas las dependencias y permisos son válidos.",
  );
}
