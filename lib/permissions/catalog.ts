export type PermissionCatalogEntry = {
  key: string;
  label: string;
  description: string;
  group: string;
  sensitive: boolean;
  dependsOn: string[];
  defaultRoles: readonly string[];
};

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  {
    key: "dashboard:read",
    label: "Tablero",
    description: "Ver el tablero principal y avisos del negocio.",
    group: "analisis",
    sensitive: false,
    dependsOn: [],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "inventory:read",
    label: "Inventario (lectura)",
    description: "Consultar el catálogo y el stock disponible.",
    group: "inventario",
    sensitive: false,
    dependsOn: [],
    defaultRoles: ["employee", "admin", "developer"],
  },
  {
    key: "inventory:manage",
    label: "Inventario (gestión)",
    description: "Crear, editar, retirar y ajustar inventario.",
    group: "inventario",
    sensitive: true,
    dependsOn: ["inventory:read"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "pos:read",
    label: "Punto de venta",
    description: "Abrir el módulo de ventas y ver el carrito del turno.",
    group: "ventas",
    sensitive: false,
    dependsOn: [],
    defaultRoles: ["employee", "admin", "developer"],
  },
  {
    key: "sales:create",
    label: "Registrar ventas",
    description: "Crear ventas y llevar cobros al mostrador.",
    group: "ventas",
    sensitive: true,
    dependsOn: ["pos:read"],
    defaultRoles: ["employee", "admin", "developer"],
  },
  {
    key: "cash:operate",
    label: "Operar caja",
    description: "Abrir, cerrar y operar la caja del turno.",
    group: "caja",
    sensitive: true,
    dependsOn: ["pos:read"],
    defaultRoles: ["employee", "admin", "developer"],
  },
  {
    key: "customers:manage",
    label: "Clientes",
    description: "Gestionar clientes y sus compras.",
    group: "ventas",
    sensitive: false,
    dependsOn: [],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "business:manage",
    label: "Configuración del negocio",
    description: "Configurar datos del negocio y documentos fiscales.",
    group: "configuracion",
    sensitive: true,
    dependsOn: [],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "prices:manage",
    label: "Comparar precios",
    description: "Administrar cotizaciones y precios de proveedores.",
    group: "compras",
    sensitive: false,
    dependsOn: ["inventory:read"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "purchases:manage",
    label: "Compras",
    description: "Registrar compras y abastecimiento del negocio.",
    group: "compras",
    sensitive: false,
    dependsOn: ["inventory:read"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "suppliers:manage",
    label: "Proveedores",
    description: "Mantener proveedores y condiciones comerciales.",
    group: "compras",
    sensitive: false,
    dependsOn: ["purchases:manage"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "users:manage",
    label: "Usuarios",
    description: "Administrar usuarios y permisos del sistema.",
    group: "equipo",
    sensitive: true,
    dependsOn: [],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "attendance:punch",
    label: "Asistencia",
    description: "Registrar entradas y salidas del personal.",
    group: "equipo",
    sensitive: false,
    dependsOn: [],
    defaultRoles: ["employee", "admin", "developer"],
  },
  {
    key: "attendance:manage",
    label: "Corregir marcajes",
    description: "Administrar marcajes, tolerancias y correcciones del equipo.",
    group: "equipo",
    sensitive: true,
    dependsOn: ["attendance:punch"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "team:manage",
    label: "Gestión de personal",
    description: "Administrar la ficha del equipo y los vínculos con cuentas.",
    group: "equipo",
    sensitive: true,
    dependsOn: ["users:manage"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "payroll:manage",
    label: "Planilla",
    description: "Gestionar nóminas, deducciones y recibos del personal.",
    group: "equipo",
    sensitive: true,
    dependsOn: ["team:manage"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "reports:read",
    label: "Reportes",
    description: "Consultar reportes y métricas del negocio.",
    group: "analisis",
    sensitive: false,
    dependsOn: ["dashboard:read"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "settings:manage",
    label: "Configuración",
    description: "Administrar ajustes globales del sistema.",
    group: "configuracion",
    sensitive: true,
    dependsOn: [],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "sales:read",
    label: "Ver ventas",
    description: "Consultar ventas registradas.",
    group: "ventas",
    sensitive: false,
    dependsOn: ["pos:read"],
    defaultRoles: ["admin", "developer"],
  },
  {
    key: "hr:read",
    label: "Personal",
    description: "Consultar información del personal del negocio.",
    group: "equipo",
    sensitive: false,
    dependsOn: ["team:manage"],
    defaultRoles: ["admin", "developer"],
  },
];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((permission) => permission.key);

export function getDefaultPermissionsForRole(role: string | null | undefined): Set<string> {
  const normalizedRole = (role ?? "").trim().toLowerCase();
  if (!normalizedRole) return new Set();

  const allPermissions = new Set<string>([...PERMISSION_KEYS, "*"]);
  if (normalizedRole === "developer" || normalizedRole === "admin") {
    return allPermissions;
  }

  const permissions = new Set<string>();
  for (const permission of PERMISSION_CATALOG) {
    if (permission.defaultRoles.includes(normalizedRole)) {
      permissions.add(permission.key);
    }
  }
  return permissions;
}
