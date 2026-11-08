const PERMISSION_KEYS = [
  "dashboard:read",
  "inventory:read",
  "inventory:manage",
  "pos:read",
  "sales:create",
  "cash:operate",
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
  "settings:manage",
  "sales:read",
  "hr:read",
] as const;

const LEGACY_PERMISSIONS: Record<string, Set<string>> = {
  developer: new Set(["*"]),
  admin: new Set(["*"]),
  employee: new Set(["inventory:read", "pos:read", "sales:create", "cash:operate", "attendance:punch"]),
  customer: new Set(),
};

function getDefaultPermissionsForRole(role: string): Set<string> {
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole === "developer" || normalizedRole === "admin") {
    return new Set([...PERMISSION_KEYS, "*"]);
  }

  if (normalizedRole === "employee") {
    return new Set(["inventory:read", "pos:read", "sales:create", "cash:operate", "attendance:punch"]);
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
      offenders.push(`${role}:${permission}: expected=${String(expectedValue)} actual=${String(actualValue)}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("Permission parity check failed:");
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log("Permission parity OK");
