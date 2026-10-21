import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
function readCsv(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8").trim();
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  const [headers, ...values] = records;
  return values.map((valuesRow) => Object.fromEntries(headers.map((header, index) => [header, valuesRow[index] ?? ""])));
}
const nullable = (value) => value ? value : null;
const dateOrNull = (value) => value ? new Date(value.replace(" ", "T")) : null;
try {
  if (await prisma.categoria.count() === 0) {
    const categories = readCsv("./data/categorias.csv").map((row) => ({
      id: row.category_id,
      categoryName: row.category_name,
      itemsSold: Number(row.items_sold),
      totalQuantitySold: Number(row.total_quantity_sold),
      totalRevenue: row.total_revenue,
    })).filter((row) => row.id && row.categoryName && Number.isFinite(row.itemsSold));
    await prisma.categoria.createMany({ data: categories });
    console.log(`Categorías reales cargadas: ${categories.length}`);
  } else {
    console.log("Categorías: ya hay datos — skip seed");
  }
  if (await prisma.producto.count() === 0) {
    const categoryIds = new Set((await prisma.categoria.findMany({ select: { id: true } })).map((row) => row.id));
    const rows = readCsv("./data/productos.csv").slice(0, 500);
    const products = [];
    for (const row of rows) {
      const valid = row.id && row.sku && row.name && Number.isFinite(Number(row.sale_price)) && Number.isInteger(Number(row.current_stock));
      if (!valid || (row.category_id && !categoryIds.has(row.category_id))) {
        console.log(`Producto omitido por datos incompletos o categoría inexistente: ${row.sku || "sin código"}`);
        continue;
      }
      products.push({
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: nullable(row.description),
        categoryId: nullable(row.category_id),
        purchasePrice: row.purchase_price || "0",
        salePrice: row.sale_price,
        currentStock: Number(row.current_stock),
        minStock: Number(row.min_stock || 0),
        imageUrl: nullable(row.image_url),
        isActive: row.is_active === "true",
        hasExpiry: row.has_expiry === "true",
        expiryDate: dateOrNull(row.expiry_date),
        priceIncludesTax: row.price_includes_tax === "true",
        createdBy: nullable(row.created_by),
        updatedBy: nullable(row.updated_by),
        createdAt: dateOrNull(row.created_at) ?? new Date(),
        updatedAt: dateOrNull(row.updated_at) ?? new Date(),
      });
    }
    await prisma.producto.createMany({ data: products, skipDuplicates: true });
    console.log(`Productos reales cargados: ${products.length}`);
  } else {
    console.log("Productos: ya hay datos — skip seed");
  }
} finally {
  await prisma.$disconnect();
}
