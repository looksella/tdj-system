# Buen Negocio
Sistema de gestión para comercio en El Salvador; interfaz en español (tú), moneda USD, zona America/El_Salvador.
## Stack e identidad
- Next.js 15, React 19, Prisma 5.22, shadcn/ui sobre Radix y Tailwind CSS v4 ya vienen instalados.
- Identidad verde comercio `oklch(0.43 0.085 166)` con acento cálido, headings Fraunces y cuerpo DM Sans; fondo con lavado diagonal suave, sombras suaves y tracking apretado.
- La navegación principal está en `components/workspace/sidebar.tsx`; el asistente `/asistente` es un módulo de la aplicación.
## Módulos construidos
- **Tablero** (resumen de ventas, categorías históricas y alertas): `app/(workspace)/page.tsx`.
- **Inventario** (catálogo, búsqueda, categorías, edición, retiro y movimientos): `app/(workspace)/inventario/page.tsx`, `app/(workspace)/inventario/movimientos/page.tsx`, `components/inventory/product-table.tsx`, `components/inventory/product-dialog.tsx`, `components/inventory/product-actions.tsx`, `lib/actions/commerce.ts`.
- **Punto de venta** (carrito, cobro, ticket, historial, edición de pago y anulación con devolución de stock): `app/(workspace)/ventas/page.tsx`, `components/sales/pos-screen.tsx`, `lib/actions/commerce.ts`.
- **Compras y abastecimiento** (alta, edición, historial y actualización de existencias): `app/(workspace)/compras/page.tsx`, `components/purchases/purchase-dialog.tsx`, `lib/actions/commerce.ts`.
- **Proveedores** (alta, edición, directorio y condiciones comerciales): `app/(workspace)/proveedores/page.tsx`, `components/suppliers/supplier-dialog.tsx`, `lib/actions/commerce.ts`.
- **Comparativa de precios** (cotizaciones, edición y mejor precio por producto): `app/(workspace)/comparar-precios/page.tsx`, `components/supplier-prices/supplier-price-dialog.tsx`, `lib/actions/commerce.ts`.
- **Clientes** (alta, edición, directorio y resumen de compras): `app/(workspace)/clientes/page.tsx`, `components/customers/customer-dialog.tsx`, `lib/actions/commerce.ts`.
- **Reportes** (ventas de los últimos 30 días, productos y categorías con más salida, inventario y reposición): `app/(workspace)/reportes/page.tsx`.
- **Caja** (apertura por denominación, movimientos, arqueo ciego e historial): `app/(workspace)/caja/page.tsx`, `components/caja/cash-workspace.tsx`, `lib/actions/operations.ts`.
- **Asistencia** (marcajes por PIN, tolerancia, corrección y semana reciente): `app/(workspace)/asistencia/page.tsx`, `components/asistencia/attendance-workspace.tsx`, `lib/actions/operations.ts`.
- **Planilla** (horas desde marcajes, ISSS/AFP/renta, recibos y gestión del equipo con PIN y correo): `app/(workspace)/planilla/page.tsx`, `components/planilla/payroll-workspace.tsx`, `lib/payroll.ts`, `lib/actions/operations.ts`.
## Turno: quién puede qué
- El reparto de permisos vive en `lib/auth-helpers.ts` (`PERMISSIONS` y `PERMISOS_TURNO`) y se aplica en el menú, en `requirePagePermission` y en cada Server Action de `lib/actions/operations.ts`.
- Empleado (`cash:operate`, `attendance:punch`): abre y cierra solo su caja y marca solo su asistencia. La ficha se resuelve por el correo de su cuenta; el id del formulario se descarta para ese rol.
- Administrador: además `attendance:manage`, `payroll:manage` y `team:manage` (corregir marcajes, tolerancia, planilla, salarios, alta de personas y vínculo por correo).
- Las escrituras de caja se bloquean sobre turnos cerrados; borrar una persona con historial la desactiva en vez de perder arqueos o liquidaciones.
## Pendientes
- Facturación electrónica DTE y Precio sugerido tienen páginas específicas en `app/(workspace)/[module]/page.tsx`.
## Datos y próximas iteraciones
- Schema en `prisma/schema.prisma`; cliente de base de datos en `lib/db.ts`.
- Los CSV reales usados para el arranque están en `prisma/data/`; el seed idempotente está en `prisma/seed.mjs` (500 productos y 23 categorías).
- El catálogo vivo se ordena desde las ventas reales del Cashbook con `npm run sincronizar-inventario -- <archivo.xlsx> [--aplicar]` (`scripts/sincronizar-inventario.mjs`): empareja por nombre normalizado, crea lo faltante con el precio cobrado, desactiva lo que no vendió y recalcula el historial por categoría. Respaldos y detalle en `prisma/data/backup/`.
- `npm run setup` regenera Prisma y aplica el schema; `npm run seed` carga datos solo en tablas vacías. Configura `DATABASE_URL` y `DIRECT_DATABASE_URL` en `.env`.
