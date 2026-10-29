import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ProductTable } from "@/components/inventory/product-table";
import { ProductDialog } from "@/components/inventory/product-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/locale";
import { isAllowed } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/require-page-permission";
export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
type SearchParams = Promise<{ page?: string; q?: string; categoria?: string; stock?: string }>;
type ProductRow = { id: string; sku: string; name: string; description: string | null; categoryId: string | null; categoryName: string; purchasePrice: string; salePrice: string; currentStock: number; minStock: number; imageUrl: string | null; isActive: boolean };
export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePagePermission("inventory:read");
  const canManageInventory = isAllowed(user.role, "inventory:manage");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = (params.q ?? "").trim().slice(0, 80);
  const categoryId = params.categoria && params.categoria !== "__all__" && /^[0-9a-f-]{36}$/i.test(params.categoria) ? params.categoria : "";
  const lowOnly = params.stock === "bajo";
  const skip = (page - 1) * PAGE_SIZE;
  const filters = Prisma.sql`
    ${canManageInventory ? Prisma.empty : Prisma.sql`AND p.is_active = true`}
    ${search ? Prisma.sql`AND (p.name ILIKE ${`%${search}%`} OR p.sku ILIKE ${`%${search}%`})` : Prisma.empty}
    ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}::uuid` : Prisma.empty}
    ${lowOnly ? Prisma.sql`AND p.current_stock <= p.min_stock` : Prisma.empty}
  `;
  const [productRows, countRows, categories, lowCount, activeCount] = await Promise.all([
    db.$queryRaw<ProductRow[]>(Prisma.sql`SELECT p.id, p.sku, p.name, p.description, p.category_id AS "categoryId", COALESCE(c.category_name, '') AS "categoryName", p.purchase_price::text AS "purchasePrice", p.sale_price::text AS "salePrice", p.current_stock AS "currentStock", p.min_stock AS "minStock", p.image_url AS "imageUrl", p.is_active AS "isActive" FROM productos p LEFT JOIN categorias c ON c.id = p.category_id WHERE TRUE ${filters} ORDER BY p.name ASC LIMIT ${PAGE_SIZE} OFFSET ${skip}`),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM productos p WHERE TRUE ${filters}`),
    db.categoria.findMany({ select: { id: true, categoryName: true }, orderBy: { categoryName: "asc" } }),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM productos WHERE is_active = true AND current_stock <= min_stock`),
    db.producto.count({ where: { isActive: true } }),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const lowStockCount = Number(lowCount[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const products = productRows.map((product) => ({ ...product, categoryName: product.categoryName ?? "" }));
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Control de existencias</p><h1 className="display-heading text-4xl font-semibold sm:text-5xl">Inventario</h1><p className="mt-2 text-muted-foreground">Productos, precios y alertas para que siempre sepas qué tienes.</p></div>
        <div className="flex items-center gap-3">{canManageInventory && <><Link href="/inventario/movimientos" prefetch={false} className="text-sm font-semibold text-primary hover:underline">Ver movimientos →</Link><ProductDialog categories={categories} /></>}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="panel-shadow border-border/80"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Productos activos</p><p className="mt-1 text-3xl font-bold tabular-nums">{activeCount.toLocaleString("es-SV")}</p></div><span className="rounded-2xl bg-secondary px-3 py-2 text-xs font-semibold text-primary">Catálogo real</span></CardContent></Card>
        <Card className="panel-shadow border-amber-200/80 bg-amber-50/50"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-amber-900/70">Necesitan reposición</p><p className="mt-1 text-3xl font-bold tabular-nums text-amber-950">{lowStockCount.toLocaleString("es-SV")}</p></div><p className="max-w-32 text-right text-xs text-amber-900/70">Alcanza el mínimo configurado o está por debajo.</p></CardContent></Card>
      </div>
      <ProductTable products={products} categories={categories} page={page} pageCount={pageCount} total={total} search={search} categoryId={categoryId} lowOnly={lowOnly} canManage={canManageInventory} />
    </div>
  );
}
