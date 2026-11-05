# Escáner remoto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Permitir registrar códigos de barras y vincular un celular autenticado con el POS o inventario para escanear productos de forma remota.

**Architecture:** El servidor conserva la autoridad sobre permisos y productos. La PC y el móvil se comunican solamente mediante Supabase Realtime Broadcast/Presence en un canal efímero; el móvil nunca modifica ventas ni inventario. Los componentes que usan cámara, navegador, Realtime o estado son Client Components, mientras que la ruta móvil conserva la protección de sesión del App Router.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 5, Supabase Auth/Realtime, shadcn/ui, Sonner, qrcode.react y ZXing.

**Spec:** Solicitud del usuario “escáner remoto desde el celular + código de barras + botón de eliminar producto”, autorizada el 2026-11-05 para ajustar \`proxy.ts\` a fin de permitir cámara y conservar query parameters en \`redirect_url\`.

## Global Constraints

- Añadir únicamente \`Producto.barcode String? @unique\`; ningún cambio destructivo de base de datos.
- No modificar los flujos de \`createSale\`, caja, planilla, asistencia ni autenticación; solo conectarse a funciones existentes.
- Mantener \`initialStock\` y su movimiento “Inventario inicial”; \`updateProduct\` no modifica \`currentStock\`.
- Mostrar el escáner solo cuando \`NEXT_PUBLIC_ENABLE_REMOTE_SCANNER === "true"\`.
- Todo texto visible estará en español; no añadir Zustand ni React Query.
- Las Server Actions autentican, autorizan y validan toda entrada no confiable.
- Antes del despliegue de código se aplica la columna SQL en producción.

## Review Focus

- Un código de barras vacío, corto o con símbolos no puede persistirse; el test de utilidades de barcode cubre la normalización y el límite 4–64.
- Un barcode no puede coincidir con el SKU de otro producto; las acciones vuelven un mensaje no ambiguo.
- Un producto con líneas de venta o compra no se borra, incluso ante una carrera de clave foránea.
- Un \`scan\` repetido no agrega otra unidad y un producto agotado resulta en \`sin_stock\`.
- La cámara solo queda habilitada para la página móvil y el redirect de autenticación conserva \`session\` y \`n\`.

---

### Task 1: Esquema y reglas puras de código de barras (Parte A)

**Files:**
- Create: \`lib/product-barcode.ts\`
- Create: \`lib/product-barcode.test.ts\`
- Modify: \`prisma/schema.prisma\`

**Interfaces:**
- Produces \`parseBarcode(raw: string): string | null\` y \`isBarcodeFormatValid(raw: string): boolean\`.
- \`commerce.ts\` consume \`parseBarcode\` para guardar \`null\` para vacío y rechazar valores inválidos.

- [ ] Escribir tests fallidos para espacio en blanco, valores alfanuméricos válidos y límites inválidos.
- [ ] Ejecutar \`npm test -- lib/product-barcode.test.ts\` y verificar fallo por módulo ausente.
- [ ] Implementar las utilidades mínimas y añadir \`barcode String? @unique\` a Prisma.
- [ ] Ejecutar el test y el typecheck relevante; confirmar verde.
- [ ] Commit: \`feat: add optional product barcode schema\`.

### Task 2: Acciones seguras de producto y consulta de escaneo (Parte B)

**Files:**
- Create: \`lib/scanner-protocol.ts\`
- Create: \`lib/scanner-protocol.test.ts\`
- Modify: \`lib/actions/commerce.ts\`

**Interfaces:**
- Consumes \`parseBarcode\`.
- Produces \`findProductByCode(raw: string)\` con estados \`ok | not_found | retirado | error\`, y \`deleteProduct(id: string)\` con \`{ ok, message }\`.
- \`use-remote-scanner-pc.ts\` consume el producto serializado de \`findProductByCode\`.

- [ ] Escribir tests fallidos para validar eventos scanner y mapear los estados de respuesta permitidos.
- [ ] Ejecutar el test y confirmar fallo esperado.
- [ ] Incorporar barcode en creación/edición, detectar colisión con SKU ajeno, implementar búsqueda con \`sales:create\` y borrado condicionado al historial comercial.
- [ ] Ejecutar tests unitarios y \`npm test\`.
- [ ] Commit: \`feat: add barcode product actions\`.

### Task 3: Gestión de barcode y eliminación en inventario (Parte C)

**Files:**
- Modify: \`app/(workspace)/inventario/page.tsx\`
- Modify: \`components/inventory/product-dialog.tsx\`
- Modify: \`components/inventory/product-actions.tsx\`
- Modify: \`components/inventory/product-table.tsx\`

**Interfaces:**
- Consumes \`deleteProduct\` y los tipos de producto con \`barcode\`.
- Produce el formulario de barcode y \`DeleteProduct({ id, name, stock })\`.

- [ ] Añadir un test de comportamiento de la capa pura de confirmación/estado si se extrae una utilidad; de no requerirse lógica nueva testeable, documentar que la UI sigue los componentes shadcn existentes.
- [ ] Añadir el campo de formulario y propagar \`barcode\` desde la consulta SQL.
- [ ] Añadir el AlertDialog destructivo y mostrarlo a administradores para productos activos y retirados.
- [ ] Ejecutar lint y pruebas.
- [ ] Commit: \`feat: manage barcodes and delete products in inventory\`.

### Task 4: Transporte remoto y escáner móvil (Parte D)

**Files:**
- Create: \`hooks/use-remote-scanner-pc.ts\`
- Create: \`components/scanner/remote-scanner-modal.tsx\`
- Create: \`components/scanner/mobile-scanner.tsx\`
- Create: \`app/escaner-movil/page.tsx\`
- Create: \`app/escaner-movil/layout.tsx\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\`

**Interfaces:**
- Consumes \`findProductByCode\`, \`createClient\`, \`ScannerStatus\` y \`ScanEvent\`.
- Produces \`useRemoteScannerPc({ onFound })\` con \`sessionUrl\`, \`connected\`, \`unlink\` y \`refresh\`.
- La UI de PC consume el hook y la página móvil publica eventos \`scan\`.

- [ ] Escribir tests fallidos para deduplicación por secuencia y cooldown del mismo código.
- [ ] Ejecutar los tests y confirmar el fallo.
- [ ] Instalar dependencias permitidas compatibles con React 19.
- [ ] Implementar canal, Presence, persistencia de 12 h, QR, cámara/ZXing, feedback, Wake Lock y desvinculación.
- [ ] Ejecutar tests, lint y build.
- [ ] Commit: \`feat: add remote mobile scanner\`.

### Task 5: Integración, encabezados y entrega operativa (Parte E)

**Files:**
- Modify: \`components/sales/pos-screen.tsx\`
- Modify: \`components/inventory/product-table.tsx\`
- Modify: \`proxy.ts\`
- Modify: \`README.md\`

**Interfaces:**
- POS entrega \`onFound(product) => "ok" | "sin_stock"\` sin tocar el cobro.
- Inventario entrega \`onFound(product) => "ok"\` y navega con filtros conservados y página reiniciada.

- [ ] Escribir test fallido para la construcción segura de una URL de retorno que preserve búsqueda.
- [ ] Implementar integración POS/inventario, CSP/Permissions-Policy limitado a la ruta móvil y redirect preservando la URL interna completa.
- [ ] Documentar SQL, orden de respaldo/migración/deploy, instalación de dependencias y la variable de Vercel.
- [ ] Ejecutar \`npm test\`, \`npm run lint\` y \`npm run build\`; realizar revisión del diff contra los constraints.
- [ ] Commit: \`feat: integrate remote scanner safely\`.
