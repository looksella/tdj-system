export type FeatureKind = "core" | "optional";

export type FeatureCatalogEntry = {
  key: string;
  label: string;
  description: string;
  group: string;
  kind: FeatureKind;
  defaultEnabled: boolean;
  dependsOn: string[];
  permissions: string[];
};

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  {
    key: "inventory",
    label: "Inventario",
    description: "Catálogo, búsqueda y movimientos del inventario.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: ["inventory:read"],
    permissions: ["inventory:read"],
  },
  {
    key: "pos",
    label: "Punto de venta",
    description: "Módulo de ventas y cobro del mostrador.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: ["pos:read"],
    permissions: ["pos:read"],
  },
  {
    key: "cash",
    label: "Caja",
    description: "Apertura, arqueo y cierre del turno de caja.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: ["cash:operate"],
    permissions: ["cash:operate"],
  },
  {
    key: "settings",
    label: "Configuración",
    description: "Ajustes y administración general del negocio.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: ["settings:manage"],
    permissions: ["settings:manage"],
  },
  {
    key: "signin",
    label: "Inicio de sesión",
    description: "Acceso y autenticación del sistema.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: [],
    permissions: [],
  },
  {
    key: "purchases",
    label: "Compras",
    description: "Registro y gestión de compras y abastecimiento.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["purchases:manage"],
    permissions: ["purchases:manage"],
  },
  {
    key: "supplier-orders",
    label: "Pedidos a proveedores",
    description: "Estados de pedido, recepción y entregas a proveedores.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["purchases:manage"],
    permissions: ["purchases:manage"],
  },
  {
    key: "quick-purchase",
    label: "Producto exprés",
    description: "Flujo rápido de alta de productos en compras.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["purchases:manage"],
    permissions: ["purchases:manage"],
  },
  {
    key: "suppliers",
    label: "Proveedores",
    description: "Directorio y condiciones comerciales de proveedores.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["suppliers:manage"],
    permissions: ["suppliers:manage"],
  },
  {
    key: "supplier-alerts",
    label: "Alertas de proveedores",
    description: "Alertas y seguimiento del dashboard para proveedores.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["suppliers:manage"],
    permissions: ["suppliers:manage"],
  },
  {
    key: "customers",
    label: "Clientes",
    description: "Directorio y resumen de compras de clientes.",
    group: "ventas",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["customers:manage"],
    permissions: ["customers:manage"],
  },
  {
    key: "reports",
    label: "Reportes y estadísticas",
    description: "Dashboard y analítica del negocio.",
    group: "analisis",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["reports:read"],
    permissions: ["reports:read"],
  },
  {
    key: "remote-scanner-mobile",
    label: "Escáner remoto móvil",
    description: "Escáner de códigos desde dispositivos móviles.",
    group: "inventario",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["inventory:read"],
    permissions: ["inventory:read"],
  },
  {
    key: "pos-discounts",
    label: "Descuentos en POS",
    description: "Descuentos manuales y promociones en ventas.",
    group: "ventas",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["sales:create"],
    permissions: ["sales:create"],
  },
  {
    key: "delete-products",
    label: "Eliminación definitiva",
    description: "Borrado permanente de productos desde inventario.",
    group: "inventario",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["inventory:manage"],
    permissions: ["inventory:manage"],
  },
  {
    key: "manual-stock-adjustment",
    label: "Ajuste manual de existencias",
    description: "Corrección manual del stock del inventario.",
    group: "inventario",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["inventory:manage"],
    permissions: ["inventory:manage"],
  },
  {
    key: "attendance",
    label: "Asistencia",
    description: "Marcajes, correcciones y seguimientos del personal.",
    group: "equipo",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["attendance:punch"],
    permissions: ["attendance:punch"],
  },
  {
    key: "payroll",
    label: "Planilla",
    description: "Cálculo, recibos y gestión de salarios.",
    group: "equipo",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["payroll:manage"],
    permissions: ["payroll:manage"],
  },
  {
    key: "require-attendance-to-open-cash",
    label: "Exigir asistencia para abrir caja",
    description: "Bloquea la apertura de caja si la persona no registró su entrada.",
    group: "caja",
    kind: "optional",
    defaultEnabled: false,
    dependsOn: ["cash:operate", "attendance:punch"],
    permissions: ["cash:operate", "attendance:punch"],
  },
];

export const FEATURE_BY_KEY = new Map(FEATURE_CATALOG.map((feature) => [feature.key, feature]));

export function isFeatureEnabled(featureKey: string, userRole?: string | null): boolean {
  const feature = FEATURE_BY_KEY.get(featureKey);
  if (!feature) return false;
  if (feature.kind === "core") return feature.defaultEnabled;

  if (
    feature.key === "remote-scanner-mobile" &&
    process.env.NEXT_PUBLIC_ENABLE_REMOTE_SCANNER !== undefined &&
    process.env.NEXT_PUBLIC_ENABLE_REMOTE_SCANNER !== "true"
  ) {
    return false;
  }

  if (process.env.PERMISSIONS_OVERRIDES_DISABLED === "true") {
    return feature.defaultEnabled;
  }

  if (userRole && feature.permissions.length > 0) {
    return feature.permissions.every((permission) => {
      const role = String(userRole).trim().toLowerCase();
      if (role === "admin" || role === "developer") return true;
      return permission !== "";
    });
  }

  return feature.defaultEnabled;
}
