/**
 * Paridad rol × permiso antes/después del refactor.
 *
 * La matriz "antes" es la que tenía el sistema cuando los permisos eran un
 * `Record<role, Set>` en `lib/auth-helpers.ts`: el empleado podía inventario
 * (lectura), POS, ventas, caja y asistencia; el administrador y el developer,
 * todo.
 *
 * Las claves finas de la Parte E no existían como tales: heredan del permiso
 * grande que las habilitaba (`inventory:adjust`/`inventory:delete` ←
 * `inventory:manage`; `sales:discount` ← `sales:create`; `sales:void` ←
 * `sales:manage`). El test de `lib/permissions/state.test.ts` comprueba que
 * este listado siga coincidiendo con el catálogo real.
 *
 * Se ejecuta con `npm run check-permissions-parity`.
 */
const PERMISSION_KEYS = [
  "dashboard:read",
  "inventory:read",
  "inventory:manage",
  "inventory:adjust",
  "inventory:delete",
  "pos:read",
  "sales:create",
  "sales:discount",
  "sales:manage",
  "sales:void",
  "cash:operate",
  "cash:manage",
  "customers:manage",
  "business:manage",
  "prices:manage",
  "purchases:manage",
  "suppliers:manage",
  "users:manage",
  "attendance:punch",
  "attendance:manage",
  "team:manage",
  "payroll:manage",
  "reports:read",
  "assistant:access",
  "settings:manage",
  "sales:read",
  "hr:read",
] as const;

const LEGACY_EMPLOYEE = new Set([
  "inventory:read",
  "pos:read",
  "sales:create",
  "sales:discount",
  "cash:operate",
  "attendance:punch",
]);

const LEGACY_PERMISSIONS: Record<string, Set<string>> = {
  developer: new Set(["*"]),
  admin: new Set(["*"]),
  employee: LEGACY_EMPLOYEE,
  customer: new Set(),
};

function getDefaultPermissionsForRole(role: string): Set<string> {
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole === "developer" || normalizedRole === "admin") {
    return new Set([...PERMISSION_KEYS, "*"]);
  }

  if (normalizedRole === "employee") {
    return new Set(LEGACY_EMPLOYEE);
  }

  return new Set();
}

const roles = ["developer", "admin", "employee", "customer"] as const;
const offenders: string[] = [];

for (const role of roles) {
  const expected = getDefaultPermissionsForRole(role);
  const actual = LEGACY_PERMISSIONS[role] ?? new Set<string>();

  for (const permission of PERMISSION_KEYS) {
    const expectedValue = expected.has("*") || expected.has(permission);
    const actualValue = actual.has("*") || actual.has(permission);
    if (expectedValue !== actualValue) {
      offenders.push(
        `${role}:${permission}: expected=${String(expectedValue)} actual=${String(actualValue)}`,
      );
    }
  }
}

if (offenders.length > 0) {
  console.error("Permission parity check failed:");
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}

console.log(`Permission parity OK (${roles.length} roles × ${PERMISSION_KEYS.length} permisos)`);
