import { Prisma } from "@prisma/client";
import { isAllowed } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export const dynamic = "force-dynamic";

const SORT_COLUMNS = {
  producto: Prisma.sql`p.name`,
  categoria: Prisma.sql`c.category_name`,
  precio: Prisma.sql`p.sale_price`,
  existencias: Prisma.sql`p.current_stock`,
  vencimiento: Prisma.sql`p.expiry_date`,
  estado: Prisma.sql`p.is_active`,
} as const;

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await getEffectiveUser();
  if (!user || !isAllowed(user.role, "inventory:read")) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const search = (params.get("q") ?? "").trim().slice(0, 80);
  const rawCategoryId = params.get("categoria") ?? "";
  const categoryId = /^[0-9a-f-]{36}$/i.test(rawCategoryId) ? rawCategoryId : "";
  const lowOnly = params.get("stock") === "bajo";
  const sortValue = params.get("ordenar") ?? "";
  const sort = Object.hasOwn(SORT_COLUMNS, sortValue)
    ? (sortValue as keyof typeof SORT_COLUMNS)
    : "producto";
  const orderBy = params.get("direccion") === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const filters = Prisma.sql`
    ${isAllowed(user.role, "inventory:manage") ? Prisma.empty : Prisma.sql`AND p.is_active = true`}
    ${search ? Prisma.sql`AND (p.name ILIKE ${`%${search}%`} OR p.sku ILIKE ${`%${search}%`})` : Prisma.empty}
    ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}::uuid` : Prisma.empty}
    ${lowOnly ? Prisma.sql`AND p.current_stock <= p.min_stock` : Prisma.empty}
  `;
  const products = await db.$queryRaw<
    Array<{
      sku: string;
      name: string;
      categoryName: string;
      salePrice: string;
      purchasePrice: string;
      currentStock: number;
      minStock: number;
      isActive: boolean;
      expiryDate: string | null;
      imageUrl: string | null;
    }>
  >(Prisma.sql`
    SELECT p.sku, p.name, COALESCE(c.category_name, '') AS "categoryName",
      p.sale_price::text AS "salePrice", p.purchase_price::text AS "purchasePrice",
      p.current_stock AS "currentStock", p.min_stock AS "minStock",
      p.is_active AS "isActive", p.expiry_date::text AS "expiryDate",
      p.image_url AS "imageUrl"
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.category_id
    WHERE TRUE ${filters}
    ORDER BY ${SORT_COLUMNS[sort]} ${orderBy} NULLS LAST, p.name ASC
  `);
  const headers = [
    "SKU",
    "Producto",
    "Categoría",
    "Precio de venta",
    "Costo",
    "Existencias",
    "Mínimo",
    "Estado",
    "Vencimiento",
    "URL de imagen",
  ];
  const rows = products.map((product) => [
    product.sku,
    product.name,
    product.categoryName,
    product.salePrice,
    product.purchasePrice,
    product.currentStock,
    product.minStock,
    product.isActive ? "Activo" : "Retirado",
    product.expiryDate,
    product.imageUrl,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inventario.csv"',
      "Cache-Control": "no-store",
    },
  });
}
