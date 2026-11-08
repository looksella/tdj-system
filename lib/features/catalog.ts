export type FeatureKind = "core" | "optional";

export type FeatureCatalogEntry = {
  key: string;
  label: string;
  description: string;
  group: string;
  kind: FeatureKind;
  defaultEnabled: boolean;
  /** Otras herramientas de las que depende. Apagar la base apaga la derivada. */
  dependsOn: string[];
  /** Permisos que la herramienta necesita además del estado encendido. */
  permissions: string[];
  /** Interruptor maestro por variable de entorno (solo escáner remoto). */
  envGate?: { variable: string; value: string };
};

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  {
    key: "inventory",
    label: "Inventario",
    description: "Catálogo, búsqueda y movimientos del inventario.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["inventory:read"],
  },
  {
    key: "pos",
    label: "Punto de venta",
    description: "Módulo de ventas y cobro del mostrador.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["pos:read"],
  },
  {
    key: "cash",
    label: "Caja",
    description: "Apertura, arqueo y cierre del turno de caja.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["cash:operate"],
  },
  {
    key: "settings",
    label: "Configuración",
    description: "Ajustes y administración general del negocio.",
    group: "núcleo",
    kind: "core",
    defaultEnabled: true,
    dependsOn: [],
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
    dependsOn: [],
    permissions: ["purchases:manage"],
  },
  {
    key: "supplier-orders",
    label: "Pedidos a proveedores",
    description: "Estados de pedido, recepción y entregas a proveedores.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["purchases"],
    permissions: ["purchases:manage"],
  },
  {
    key: "quick-purchase",
    label: "Producto exprés",
    description: "Flujo rápido de alta de productos en compras.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["purchases"],
    permissions: ["purchases:manage"],
  },
  {
    key: "suppliers",
    label: "Proveedores",
    description: "Directorio y condiciones comerciales de proveedores.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["suppliers:manage"],
  },
  {
    key: "supplier-alerts",
    label: "Alertas de proveedores",
    description: "Alertas y seguimiento del dashboard para proveedores.",
    group: "compras",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: ["suppliers"],
    permissions: ["suppliers:manage"],
  },
  {
    key: "customers",
    label: "Clientes",
    description: "Directorio y resumen de compras de clientes.",
    group: "ventas",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["customers:manage"],
  },
  {
    key: "reports",
    label: "Reportes y estadísticas",
    description: "Dashboard y analítica del negocio.",
    group: "analisis",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["reports:read"],
  },
  {
    key: "remote-scanner-mobile",
    label: "Escáner remoto móvil",
    description: "Escáner de códigos desde dispositivos móviles.",
    group: "inventario",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["inventory:read"],
    envGate: { variable: "NEXT_PUBLIC_ENABLE_REMOTE_SCANNER", value: "true" },
  },
  {
    key: "pos-discounts",
    label: "Descuentos en POS",
    description: "Descuentos manuales y promociones en ventas.",
    group: "ventas",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["sales:discount"],
  },
  {
    key: "delete-products",
    label: "Eliminación definitiva",
    description: "Borrado permanente de productos desde inventario.",
    group: "inventario",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["inventory:delete"],
  },
  {
    key: "manual-stock-adjustment",
    label: "Ajuste manual de existencias",
    description: "Corrección manual del stock del inventario.",
    group: "inventario",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["inventory:adjust"],
  },
  {
    key: "attendance",
    label: "Asistencia",
    description: "Marcajes, correcciones y seguimientos del personal.",
    group: "equipo",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["attendance:punch"],
  },
  {
    key: "payroll",
    label: "Planilla",
    description: "Cálculo, recibos y gestión de salarios.",
    group: "equipo",
    kind: "optional",
    defaultEnabled: true,
    dependsOn: [],
    permissions: ["payroll:manage"],
  },
  {
    key: "require-attendance-to-open-cash",
    label: "Exigir asistencia para abrir caja",
    description: "Bloquea la apertura de caja si la persona no registró su entrada.",
    group: "caja",
    kind: "optional",
    // Abrir caja ya exigía marcaje antes de este interruptor: encendido = como hoy.
    defaultEnabled: true,
    dependsOn: ["attendance"],
    permissions: ["cash:operate", "attendance:punch"],
  },
];

export const FEATURE_BY_KEY = new Map(FEATURE_CATALOG.map((feature) => [feature.key, feature]));
export const FEATURE_KEYS = FEATURE_CATALOG.map((feature) => feature.key);

export function getDefaultFeatureStates(): Map<string, boolean> {
  return new Map(FEATURE_CATALOG.map((feature) => [feature.key, feature.defaultEnabled]));
}

export function getFeatureDependents(featureKey: string): FeatureCatalogEntry[] {
  return FEATURE_CATALOG.filter((feature) => feature.dependsOn.includes(featureKey));
}
