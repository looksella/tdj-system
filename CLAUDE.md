# Buen Negocio
Sistema de gestión para comercio en El Salvador; interfaz en español (tú), moneda USD, zona America/El_Salvador.
## Stack e identidad
- Next.js 15, React 19, Prisma 5.22, shadcn/ui sobre Radix y Tailwind CSS v4 ya vienen instalados.
- Identidad verde comercio `oklch(0.43 0.085 166)` con acento cálido, headings Fraunces y cuerpo DM Sans; fondo con lavado diagonal suave, sombras suaves y tracking apretado.
- La navegación principal está en `components/workspace/sidebar.tsx`; el asistente `/asistente` es un módulo de plataforma.
## Módulos construidos
- **Tablero** (resumen de ventas, categorías históricas y alertas): `app/(workspace)/page.tsx`.
- **Inventario** (catálogo, búsqueda, categorías, edición, retiro y movimientos): `app/(workspace)/inventario/page.tsx`, `app/(workspace)/inventario/movimientos/page.tsx`, `components/inventory/product-table.tsx`, `components/inventory/product-dialog.tsx`, `components/inventory/product-actions.tsx`, `lib/actions/commerce.ts`.
- **Punto de venta** (carrito, cobro, ticket, historial, edición de pago y anulación con devolución de stock): `app/(workspace)/ventas/page.tsx`, `components/sales/pos-screen.tsx`, `lib/actions/commerce.ts`.
- **Compras y abastecimiento** (alta, edición, historial y actualización de existencias): `app/(workspace)/compras/page.tsx`, `components/purchases/purchase-dialog.tsx`, `lib/actions/commerce.ts`.
- **Proveedores** (alta, edición, directorio y condiciones comerciales): `app/(workspace)/proveedores/page.tsx`, `components/suppliers/supplier-dialog.tsx`, `lib/actions/commerce.ts`.
- **Comparativa de precios** (cotizaciones, edición y mejor precio por producto): `app/(workspace)/comparar-precios/page.tsx`, `components/supplier-prices/supplier-price-dialog.tsx`, `lib/actions/commerce.ts`.
- **Clientes** (alta, edición, directorio y resumen de compras): `app/(workspace)/clientes/page.tsx`, `components/customers/customer-dialog.tsx`, `lib/actions/commerce.ts`.
- **Reportes** (ventas de los últimos 30 días, productos y categorías con más salida, inventario y reposición): `app/(workspace)/reportes/page.tsx`.
## Pendientes
- Facturación electrónica DTE y Precio sugerido tienen páginas específicas en `app/(workspace)/[module]/page.tsx`.
## Datos y próximas iteraciones
- Schema en `prisma/schema.prisma`; cliente de base de datos en `lib/db.ts`.
- Los CSV reales usados para el arranque están en `prisma/data/`; el seed idempotente está en `prisma/seed.mjs` (500 productos y 23 categorías).
- `npm run setup` regenera Prisma y aplica el schema; `npm run seed` carga datos solo en tablas vacías. `DATABASE_URL` y `DIRECT_DATABASE_URL` se inyectan en los entornos de la plataforma.
