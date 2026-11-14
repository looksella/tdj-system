import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ProductTable } from "@/components/inventory/product-table";
import { ProductDialog } from "@/components/inventory/product-dialog";
import { RemoteScannerModal } from "@/components/scanner/remote-scanner-modal";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/locale";
import { isFeatureEnabled } from "@/lib/features/resolve";
import { getEffectivePermissions, hasPermission } from "@/lib/permissions/resolve";
import { requirePagePermission } from "@/lib/require-page-permission";
import { isRemoteScannerEnabled } from "@/lib/remote-scanner-config";
export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario" };
const PAGE_SIZE = 30;
type SearchParams = Promise<{
  page?: string;
  q?: string;
  categoria?: string;
  stock?: string;
  ordenar?: string;
  direccion?: string;
}>;
type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string;
  purchasePrice: string;
  salePrice: string;
  currentStock: number;
  minStock: number;
  imageUrl: string | null;
  expiryDate: string | null;
  isActive: boolean;
};
type PresentationView = {
  id: string;
  name: string;
  unitsPerPresentation: number;
  salePrice: string;
  barcode: string | null;
  closedStock: number;
};
const SORT_COLUMNS = {
  producto: Prisma.sql`p.name`,
  categoria: Prisma.sql`c.category_name`,
  precio: Prisma.sql`p.sale_price`,
  existencias: Prisma.sql`p.current_stock`,
  vencimiento: Prisma.sql`p.expiry_date`,
  estado: Prisma.sql`p.is_active`,
} as const;
export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePagePermission("inventory:read");
  const permissions = await getEffectivePermissions(user);
  const canManageInventory = hasPermission(permissions, "inventory:manage");
  const scannerEnabled =
    isRemoteScannerEnabled() && (await isFeatureEnabled("remote-scanner-mobile"));
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = (params.q ?? "").trim().slice(0, 80);
  const categoryId =
    params.categoria && params.categoria !== "__all__" && /^[0-9a-f-]{36}$/i.test(params.categoria)
      ? params.categoria
      : "";
  const lowOnly = params.stock === "bajo";
  const sort =
    params.ordenar && Object.hasOwn(SORT_COLUMNS, params.ordenar)
      ? (params.ordenar as keyof typeof SORT_COLUMNS)
      : "producto";
  const direction = params.direccion === "desc" ? "desc" : "asc";
  const skip = (page - 1) * PAGE_SIZE;
  const orderBy = direction === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const filters = Prisma.sql`
    ${canManageInventory ? Prisma.empty : Prisma.sql`AND p.is_active = true`}
    ${search ? Prisma.sql`AND (p.name ILIKE ${`%${search}%`} OR p.sku ILIKE ${`%${search}%`} OR p.barcode ILIKE ${`%${search}%`})` : Prisma.empty}
    ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}::uuid` : Prisma.empty}
    ${lowOnly ? Prisma.sql`AND p.current_stock <= p.min_stock` : Prisma.empty}
  `;
  const [productRows, countRows, categories, lowCount, activeCount] = await Promise.all([
    db.$queryRaw<ProductRow[]>(
      Prisma.sql`SELECT p.id, p.sku, p.barcode, p.name, p.description, p.category_id AS "categoryId", COALESCE(c.category_name, '') AS "categoryName", p.purchase_price::text AS "purchasePrice", p.sale_price::text AS "salePrice", p.current_stock AS "currentStock", p.min_stock AS "minStock", p.image_url AS "imageUrl", p.expiry_date::text AS "expiryDate", p.is_active AS "isActive" FROM productos p LEFT JOIN categorias c ON c.id = p.category_id WHERE TRUE ${filters} ORDER BY ${SORT_COLUMNS[sort]} ${orderBy} NULLS LAST, p.name ASC LIMIT ${PAGE_SIZE} OFFSET ${skip}`,
    ),
    db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM productos p WHERE TRUE ${filters}`,
    ),
    db.categoria.findMany({
      select: { id: true, categoryName: true },
      orderBy: { categoryName: "asc" },
    }),
    db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM productos WHERE is_active = true AND current_stock <= min_stock`,
    ),
    db.producto.count({ where: { isActive: true } }),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const lowStockCount = Number(lowCount[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const presentationsByProduct = new Map<string, PresentationView[]>();
  if (productRows.length > 0) {
    try {
      const presentationRows = await db.presentacion.findMany({
        where: { productId: { in: productRows.map((product) => product.id) } },
        orderBy: { unitsPerPresentation: "asc" },
        select: {
          id: true,
          productId: true,
          name: true,
          unitsPerPresentation: true,
          salePrice: true,
          barcode: true,
          closedStock: true,
        },
      });
      for (const row of presentationRows) {
        const list = presentationsByProduct.get(row.productId) ?? [];
        list.push({
          id: row.id,
          name: row.name,
          unitsPerPresentation: row.unitsPerPresentation,
          salePrice: row.salePrice.toString(),
          barcode: row.barcode,
          closedStock: row.closedStock,
        });
        presentationsByProduct.set(row.productId, list);
      }
    } catch (error) {
      console.error("[inventario] no se pudieron leer las presentaciones", error);
    }
  }
  const products = productRows.map((product) => ({
    ...product,
    categoryName: product.categoryName ?? "",
    presentations: presentationsByProduct.get(product.id) ?? [],
  }));
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Control de existencias
          </p>
          <h1 className="display-heading text-4xl font-semibold sm:text-5xl">Inventario</h1>
          <p className="mt-2 text-muted-foreground">
            Productos, precios y alertas para que siempre sepas qué tienes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scannerEnabled &&
            (hasPermission(permissions, "pos:read") ||
              hasPermission(permissions, "inventory:read")) && (
              <RemoteScannerModal mode="inventory" enabled />
            )}
          {canManageInventory && (
            <>
              <Link
                href="/inventario/movimientos"
                prefetch={false}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Ver movimientos →
              </Link>
              <ProductDialog categories={categories} />
            </>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="panel-shadow border-border/80">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Productos activos</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {activeCount.toLocaleString("es-SV")}
              </p>
            </div>
            <span className="rounded-2xl bg-secondary px-3 py-2 text-xs font-semibold text-primary">
              Catálogo real
            </span>
          </CardContent>
        </Card>
        <Card className="panel-shadow border-amber-200/80 bg-amber-50/50">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-amber-900/70">Necesitan reposición</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-amber-950">
                {lowStockCount.toLocaleString("es-SV")}
              </p>
            </div>
            <p className="max-w-32 text-right text-xs text-amber-900/70">
              Alcanza el mínimo configurado o está por debajo.
            </p>
          </CardContent>
        </Card>
      </div>
      <ProductTable
        products={products}
        categories={categories}
        page={page}
        pageCount={pageCount}
        total={total}
        search={search}
        categoryId={categoryId}
        lowOnly={lowOnly}
        canManage={canManageInventory}
        sort={sort}
        direction={direction}
      />
    </div>
  );
}
