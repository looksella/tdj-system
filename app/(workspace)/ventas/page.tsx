import { PosScreen } from "@/components/sales/pos-screen";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/locale";
import { isAllowed } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/require-page-permission";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 8;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePagePermission("pos:read");
  const canManageSales = isAllowed(user.role, "sales:manage");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const [products, sales, count] = await Promise.all([
    db.producto.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 300,
      select: {
        id: true,
        name: true,
        sku: true,
        salePrice: true,
        currentStock: true,
        category: { select: { categoryName: true } },
      },
    }),
    db.venta.findMany({
      orderBy: { soldAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        lines: { include: { product: { select: { name: true } } } },
      },
    }),
    db.venta.count(),
  ]);

  return (
    <PosScreen
      initialProducts={products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        salePrice: product.salePrice.toString(),
        currentStock: product.currentStock,
        categoryName: product.category?.categoryName ?? null,
      }))}
      sales={sales.map((sale) => ({
        id: sale.id,
        number: sale.number,
        total: sale.total.toString(),
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        soldAtLabel: formatDateTime(sale.soldAt),
        lines: sale.lines.map((line) => ({
          productName: line.product.name,
          quantity: line.quantity,
        })),
      }))}
      salesPage={page}
      salesPageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))}
      canManageSales={canManageSales}
    />
  );
}
