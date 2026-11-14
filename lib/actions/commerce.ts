"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { denialForFeature } from "@/lib/features/guard";
import { discountedLineCents } from "@/lib/pricing";
import { autorizarAccion, autorizarAlgunaAccion, guardAccion } from "@/lib/guard-autorizacion";
import { cashMethodFromSale, lockCashOperations } from "@/lib/caja";
import { nextAvailableProductSku, normalizeManualSku, productSkuPrefix } from "@/lib/product-sku";
import { parseBarcode } from "@/lib/product-barcode";
import { productImageStoragePath } from "@/lib/product-image";
import { borrarArchivos, storageActivo } from "@/lib/beon-storage";
import { baseUnits, looseUnits, normalizeClosed, type ClosedItem } from "@/lib/presentations";

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
function productInput(formData: FormData, generatedSku?: string) {
  const sku = generatedSku ?? text(formData.get("sku"));
  const barcode = parseBarcode(text(formData.get("barcode")));
  const name = text(formData.get("name"));
  const rawImageUrl = text(formData.get("imageUrl"));
  const rawExpiryDate = text(formData.get("expiryDate"));
  const salePrice = Number(text(formData.get("salePrice")));
  const purchasePrice = Number(text(formData.get("purchasePrice")) || 0);
  const minStock = Number(text(formData.get("minStock")) || 0);
  if (
    !sku ||
    !name ||
    !Number.isFinite(salePrice) ||
    salePrice < 0 ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice < 0 ||
    !Number.isInteger(minStock) ||
    minStock < 0
  ) {
    throw new Error("Revisa el código, el nombre, los precios y el mínimo de inventario.");
  }
  let imageUrl: string | null = null;
  if (rawImageUrl) {
    let parsedImageUrl: URL;
    try {
      parsedImageUrl = new URL(rawImageUrl);
    } catch {
      throw new Error("La URL de imagen debe ser una dirección HTTPS válida de Supabase Storage.");
    }
    const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
    if (parsedImageUrl.protocol !== "https:" || parsedImageUrl.origin !== storageOrigin) {
      throw new Error("La imagen debe estar alojada en el almacenamiento configurado de Supabase.");
    }
    imageUrl = parsedImageUrl.toString();
  }
  let expiryDate: Date | null = null;
  if (rawExpiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpiryDate)) {
      throw new Error("La fecha de vencimiento no es válida.");
    }
    expiryDate = new Date(`${rawExpiryDate}T12:00:00.000Z`);
    if (
      Number.isNaN(expiryDate.getTime()) ||
      expiryDate.toISOString().slice(0, 10) !== rawExpiryDate
    ) {
      throw new Error("La fecha de vencimiento no es válida.");
    }
  }
  return {
    sku,
    barcode,
    name,
    description: text(formData.get("description")) || null,
    categoryId: text(formData.get("categoryId")) || null,
    salePrice: salePrice.toFixed(2),
    purchasePrice: purchasePrice.toFixed(2),
    minStock,
    imageUrl,
    expiryDate,
    hasExpiry: expiryDate !== null,
    isActive: formData.get("isActive") === "on",
  };
}

function uniqueViolationIncludes(error: unknown, field: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const values = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  return values.some(
    (value) => typeof value === "string" && value.toLowerCase().includes(field.toLowerCase()),
  );
}

async function rejectBarcodeSkuCollision(
  tx: Prisma.TransactionClient,
  barcode: string | null,
  productId?: string,
) {
  if (!barcode) return;
  const match = await tx.producto.findFirst({
    where: {
      sku: { equals: barcode, mode: "insensitive" },
      ...(productId ? { NOT: { id: productId } } : {}),
    },
    select: { id: true },
  });
  if (match) throw new Error("Ese código de barras ya pertenece a otro producto.");
  const presentationMatch = await tx.presentacion.findFirst({
    where: { barcode, ...(productId ? { NOT: { productId } } : {}) },
    select: { id: true },
  });
  if (presentationMatch) {
    throw new Error("Ese código de barras ya pertenece a una presentación de otro producto.");
  }
}

type PresentationInput = {
  name: string;
  unitsPerPresentation: number;
  salePrice: string;
  barcode: string | null;
  /** Cuántas hay cerradas (sin abrir). El resto de las unidades están sueltas. */
  closedStock: number;
};

function presentationsInput(formData: FormData): PresentationInput[] {
  const raw = text(formData.get("presentations"));
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Las presentaciones no tienen un formato válido.");
  }
  if (!Array.isArray(parsed)) throw new Error("Las presentaciones no tienen un formato válido.");
  if (parsed.length > 4) throw new Error("Puedes definir hasta 4 presentaciones por producto.");
  const names = new Set<string>();
  return parsed.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const units = Number(row.unitsPerPresentation);
    const price = Number(row.salePrice);
    const closed =
      row.closedStock === undefined || row.closedStock === "" ? 0 : Number(row.closedStock);
    const barcode = parseBarcode(typeof row.barcode === "string" ? row.barcode.trim() : "");
    if (!name || name.length > 40) throw new Error("Cada presentación necesita un nombre corto.");
    if (!Number.isInteger(units) || units < 2 || units > 10000) {
      throw new Error(`“${name}” debe traer 2 unidades o más.`);
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Revisa el precio de “${name}”.`);
    }
    if (!Number.isInteger(closed) || closed < 0 || closed > 1_000_000) {
      throw new Error(`Revisa cuántas “${name}” hay sin abrir.`);
    }
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error("Hay dos presentaciones con el mismo nombre.");
    names.add(key);
    return {
      name,
      unitsPerPresentation: units,
      salePrice: price.toFixed(2),
      barcode,
      closedStock: closed,
    };
  });
}

async function rejectPresentationBarcodeCollisions(
  tx: Prisma.TransactionClient,
  inputs: PresentationInput[],
  productId: string,
) {
  const codes = inputs
    .map((input) => input.barcode)
    .filter((code): code is string => Boolean(code));
  if (new Set(codes).size !== codes.length) {
    throw new Error("Dos presentaciones tienen el mismo código de barras.");
  }
  for (const code of codes) {
    const product = await tx.producto.findFirst({
      where: { OR: [{ barcode: code }, { sku: { equals: code, mode: "insensitive" } }] },
      select: { id: true },
    });
    if (product) throw new Error("Ese código de barras ya pertenece a un producto.");
    const other = await tx.presentacion.findFirst({
      where: { barcode: code, NOT: { productId } },
      select: { id: true },
    });
    if (other) throw new Error("Ese código de barras ya pertenece a otro producto.");
  }
}

async function syncPresentations(
  tx: Prisma.TransactionClient,
  productId: string,
  inputs: PresentationInput[],
) {
  await tx.presentacion.deleteMany({
    where: { productId, NOT: { name: { in: inputs.map((input) => input.name) } } },
  });
  for (const input of inputs) {
    const data = {
      unitsPerPresentation: input.unitsPerPresentation,
      salePrice: input.salePrice,
      barcode: input.barcode,
      closedStock: input.closedStock,
      isActive: true,
    };
    await tx.presentacion.upsert({
      where: { productId_name: { productId, name: input.name } },
      update: data,
      create: { productId, name: input.name, ...data },
    });
  }
}

/** Las presentaciones sin abrir tienen que caber dentro del total de unidades. */
function assertClosedFits(totalUnits: number, inputs: PresentationInput[]) {
  const items: ClosedItem[] = inputs.map((input) => ({
    id: input.name,
    unitsPerPresentation: input.unitsPerPresentation,
    closed: input.closedStock,
  }));
  const loose = looseUnits(totalUnits, items);
  if (loose < 0) {
    throw new Error(
      `Las presentaciones sin abrir no caben en las existencias: hay ${totalUnits} unidades en total y ${totalUnits - loose} irían dentro de presentaciones sin abrir.`,
    );
  }
}

/** Si el total de unidades ya no alcanza para lo que hay sin abrir, abre las presentaciones necesarias. */
async function reconcileClosedStock(
  tx: Prisma.TransactionClient,
  productId: string,
  totalUnits: number,
) {
  const rows = await tx.presentacion.findMany({
    where: { productId, closedStock: { gt: 0 } },
    select: { id: true, unitsPerPresentation: true, closedStock: true },
  });
  if (!rows.length) return;
  const before: ClosedItem[] = rows.map((row) => ({
    id: row.id,
    unitsPerPresentation: row.unitsPerPresentation,
    closed: row.closedStock,
  }));
  const after = normalizeClosed(totalUnits, before);
  for (const item of after) {
    const old = before.find((entry) => entry.id === item.id);
    if (old && old.closed !== item.closed) {
      await tx.presentacion.update({ where: { id: item.id }, data: { closedStock: item.closed } });
    }
  }
}

async function deleteProductImage(imageUrl: string | null) {
  if (!imageUrl || !storageActivo()) return;
  const path = productImageStoragePath(
    imageUrl,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "",
  );
  if (!path) return;
  try {
    const sharedImage = await db.producto.findFirst({
      where: { imageUrl },
      select: { id: true },
    });
    if (sharedImage) return;
    await borrarArchivos([path]);
  } catch (error) {
    console.error("[deleteProduct] no se pudo limpiar la imagen del producto.", error);
  }
}

async function nextProductSku(tx: Prisma.TransactionClient, categoryId: string, productName = "") {
  const category = categoryId
    ? await tx.categoria.findUnique({ where: { id: categoryId }, select: { categoryName: true } })
    : null;
  if (categoryId && !category) throw new Error("La categoría seleccionada no existe.");

  const prefix = productSkuPrefix(category?.categoryName ?? null, productName);
  const existingSkus = await tx.producto.findMany({
    where: { sku: { startsWith: `${prefix}-` } },
    select: { sku: true },
  });
  return nextAvailableProductSku(
    prefix,
    existingSkus.map(({ sku }) => sku),
  );
}

async function rejectSkuTaken(tx: Prisma.TransactionClient, sku: string) {
  const sameSku = await tx.producto.findFirst({
    where: { sku: { equals: sku, mode: "insensitive" } },
    select: { id: true },
  });
  if (sameSku) {
    throw new Error(
      "Ya existe otro producto con ese código. Escribe uno distinto o vuelve a generarlo.",
    );
  }
  const asBarcode = await tx.producto.findFirst({ where: { barcode: sku }, select: { id: true } });
  const asPresentation = await tx.presentacion.findFirst({
    where: { barcode: sku },
    select: { id: true },
  });
  if (asBarcode || asPresentation) {
    throw new Error("Ese código ya se usa como código de barras de otro producto.");
  }
}

export async function suggestProductSku(categoryId: string, productName = "") {
  const denial = await guardAccion("inventory:manage");
  if (denial) return { ok: false as const, message: denial };
  try {
    const sku = await db.$transaction((tx) =>
      nextProductSku(tx, categoryId.trim(), productName.trim()),
    );
    return { ok: true as const, sku };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo generar el código.",
    };
  }
}

type CreateProductResult =
  | {
      ok: true;
      message: string;
      product: { id: string; sku: string; name: string; purchasePrice: string };
    }
  | { ok: false; message: string };

export async function createProduct(formData: FormData): Promise<CreateProductResult> {
  const authorization = await autorizarAccion("inventory:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    const initialStock = Number(text(formData.get("initialStock")) || 0);
    if (!Number.isInteger(initialStock) || initialStock < 0) {
      throw new Error("La cantidad inicial debe ser un número entero de cero o más.");
    }
    const presentations = formData.has("presentations") ? presentationsInput(formData) : null;
    if (presentations) assertClosedFits(initialStock, presentations);
    const categoryId = text(formData.get("categoryId"));
    const productName = text(formData.get("name"));
    const manualSku =
      text(formData.get("skuMode")) === "manual"
        ? normalizeManualSku(text(formData.get("sku")))
        : null;
    let sku = "";
    let createdProduct: {
      id: string;
      sku: string;
      name: string;
      purchasePrice: string;
    } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await db.$transaction(async (tx) => {
          const generatedSku = manualSku ?? (await nextProductSku(tx, categoryId, productName));
          if (manualSku) await rejectSkuTaken(tx, manualSku);
          const input = productInput(formData, generatedSku);
          await rejectBarcodeSkuCollision(tx, input.barcode);
          const product = await tx.producto.create({
            data: {
              ...input,
              currentStock: initialStock,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
          if (presentations) {
            await rejectPresentationBarcodeCollisions(tx, presentations, product.id);
            await syncPresentations(tx, product.id, presentations);
          }
          if (initialStock > 0) {
            await tx.movimientoStock.create({
              data: {
                productId: product.id,
                delta: initialStock,
                reason: "ajuste",
                note: "Inventario inicial",
                createdBy: actorId,
                createdByEmail: actorEmail,
              },
            });
          }
          return {
            sku: generatedSku,
            product: {
              id: product.id,
              sku: product.sku,
              name: product.name,
              purchasePrice: product.purchasePrice.toString(),
            },
          };
        });
        sku = created.sku;
        createdProduct = created.product;
        break;
      } catch (error) {
        const isSkuCollision =
          !manualSku &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          !uniqueViolationIncludes(error, "barcode");
        if (!isSkuCollision || attempt === 4) throw error;
      }
    }
    if (!createdProduct) throw new Error("No se pudo guardar el producto.");
    const savedProduct = createdProduct;
    revalidatePath("/inventario");
    revalidatePath("/compras");
    revalidatePath("/");
    return {
      ok: true,
      message: `Producto agregado al inventario con el código ${sku}.`,
      product: savedProduct,
    };
  } catch (error) {
    if (uniqueViolationIncludes(error, "barcode")) {
      return { ok: false as const, message: "Ese código de barras ya pertenece a otro producto." };
    }
    if (uniqueViolationIncludes(error, "sku")) {
      return {
        ok: false as const,
        message:
          "Ya existe otro producto con ese código. Escribe uno distinto o vuelve a generarlo.",
      };
    }
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo guardar el producto.",
    };
  }
}
export async function updateProduct(id: string, formData: FormData) {
  const authorization = await autorizarAccion("inventory:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  try {
    await db.$transaction(async (tx) => {
      const input = productInput(formData);
      await rejectBarcodeSkuCollision(tx, input.barcode, id);
      await tx.producto.update({
        where: { id },
        data: { ...input, updatedBy: authorization.usuario.id },
      });
      const presentations = formData.has("presentations") ? presentationsInput(formData) : null;
      if (presentations) {
        const stockRow = await tx.producto.findUnique({
          where: { id },
          select: { currentStock: true },
        });
        assertClosedFits(stockRow?.currentStock ?? 0, presentations);
        await rejectPresentationBarcodeCollisions(tx, presentations, id);
        await syncPresentations(tx, id, presentations);
      }
    });
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
    if (uniqueViolationIncludes(error, "barcode")) {
      return { ok: false, message: "Ese código de barras ya pertenece a otro producto." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        message: "Ya existe otro producto con ese código (SKU). Elige uno distinto.",
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el producto.",
    };
  }
}
export async function archiveProduct(id: string) {
  const authorization = await autorizarAccion("inventory:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  try {
    await db.producto.update({
      where: { id },
      data: { isActive: false, updatedBy: authorization.usuario.id },
    });
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: "Producto retirado del catálogo activo." };
  } catch {
    return { ok: false, message: "No se pudo retirar este producto." };
  }
}

export async function deleteProduct(id: string) {
  const authorization = await autorizarAccion("inventory:delete");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const off = await denialForFeature("delete-products");
  if (off) return { ok: false, message: off };

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.producto.findUnique({
        where: { id },
        select: { imageUrl: true },
      });
      if (!product) return { status: "missing" as const };

      const [sales, purchases] = await Promise.all([
        tx.lineaVenta.count({ where: { productId: id } }),
        tx.lineaCompra.count({ where: { productId: id } }),
      ]);
      if (sales > 0 || purchases > 0) return { status: "has-history" as const };

      await tx.movimientoStock.deleteMany({ where: { productId: id } });
      await tx.producto.delete({ where: { id } });
      return { status: "deleted" as const, imageUrl: product.imageUrl };
    });

    if (result.status === "missing") {
      return { ok: false, message: "El producto ya no existe." };
    }
    if (result.status === "has-history") {
      return {
        ok: false,
        message:
          "Este producto tiene ventas o compras registradas y no se puede eliminar. Usa “Retirar del catálogo” para conservar el historial.",
      };
    }

    await deleteProductImage(result.imageUrl);
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: "Producto eliminado definitivamente." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return {
          ok: false,
          message:
            "Este producto tiene ventas o compras registradas y no se puede eliminar. Usa “Retirar del catálogo” para conservar el historial.",
        };
      }
      if (error.code === "P2025") {
        return { ok: false, message: "El producto ya no existe." };
      }
    }
    console.error("[deleteProduct] no se pudo eliminar el producto.", error);
    return { ok: false, message: "No se pudo eliminar el producto." };
  }
}

export type ProductPresentation = {
  id: string;
  name: string;
  unitsPerPresentation: number;
  salePrice: string;
  /** Cuántas hay sin abrir (las únicas que se pueden vender como presentación). */
  closedStock: number;
};

export type ScannedProduct = {
  id: string;
  sku: string;
  name: string;
  salePrice: string;
  currentStock: number;
  isActive: boolean;
  categoryName: string | null;
  presentations: ProductPresentation[];
  /** Si el código escaneado era el de una caja o paquete, su id; si no, null. */
  scannedPresentationId: string | null;
};

export type FindProductByCodeResult =
  | { status: "ok"; product: ScannedProduct }
  | { status: "not_found" }
  | { status: "retirado" }
  | { status: "error" };

const scannedProductSelect = {
  id: true,
  sku: true,
  name: true,
  salePrice: true,
  currentStock: true,
  isActive: true,
  category: { select: { categoryName: true } },
  presentations: {
    where: { isActive: true },
    orderBy: { unitsPerPresentation: "asc" },
    select: {
      id: true,
      name: true,
      unitsPerPresentation: true,
      salePrice: true,
      closedStock: true,
    },
  },
} satisfies Prisma.ProductoSelect;

type ScannedProductRow = Prisma.ProductoGetPayload<{ select: typeof scannedProductSelect }>;

function toScannedProduct(
  product: ScannedProductRow,
  scannedPresentationId: string | null,
): ScannedProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    salePrice: product.salePrice.toString(),
    currentStock: product.currentStock,
    isActive: product.isActive,
    categoryName: product.category?.categoryName ?? null,
    presentations: product.presentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      unitsPerPresentation: presentation.unitsPerPresentation,
      salePrice: presentation.salePrice.toString(),
      closedStock: presentation.closedStock,
    })),
    scannedPresentationId,
  };
}

export async function findProductByCode(raw: string): Promise<FindProductByCodeResult> {
  const authorization = await autorizarAlgunaAccion(["pos:read", "inventory:read"]);
  if (!authorization.usuario) return { status: "error" };
  if (typeof raw !== "string" || !raw.trim()) return { status: "not_found" };

  try {
    const code = raw.trim();
    let product: ScannedProductRow | null = await db.producto.findFirst({
      where: {
        OR: [{ barcode: code }, { sku: { equals: code, mode: "insensitive" } }],
      },
      select: scannedProductSelect,
    });
    let scannedPresentationId: string | null = null;
    if (!product) {
      const presentation = await db.presentacion.findFirst({
        where: { barcode: code, isActive: true },
        select: { id: true, product: { select: scannedProductSelect } },
      });
      if (presentation) {
        product = presentation.product;
        scannedPresentationId = presentation.id;
      }
    }
    if (!product) return { status: "not_found" };
    if (!product.isActive) return { status: "retirado" };
    return { status: "ok", product: toScannedProduct(product, scannedPresentationId) };
  } catch (error) {
    console.error("[findProductByCode] no se pudo buscar el producto.", error);
    return { status: "error" };
  }
}

export async function adjustStock(id: string, delta: number, note: string) {
  const authorization = await autorizarAccion("inventory:adjust");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const off = await denialForFeature("manual-stock-adjustment");
  if (off) return { ok: false, message: off };
  if (!Number.isInteger(delta) || delta === 0)
    return { ok: false, message: "Indica una cantidad entera distinta de cero." };
  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.producto.findUnique({
        where: { id },
        select: { currentStock: true, name: true },
      });
      if (!product) throw new Error("No encontramos el producto.");
      if (product.currentStock + delta < 0)
        throw new Error("El ajuste no puede dejar el inventario por debajo de cero.");
      await tx.producto.update({
        where: { id },
        data: { currentStock: { increment: delta }, updatedBy: authorization.usuario.id },
      });
      await reconcileClosedStock(tx, id, product.currentStock + delta);
      await tx.movimientoStock.create({
        data: {
          productId: id,
          delta,
          reason: "ajuste",
          note: note.trim() || "Ajuste manual",
          createdBy: authorization.usuario.id,
          createdByEmail: authorization.usuario.email || authorization.usuario.id,
        },
      });
      return product.name;
    });
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: `Inventario actualizado: ${result}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo ajustar el inventario.",
    };
  }
}
export async function searchPosProducts(term: string) {
  const denial = await guardAccion("pos:read");
  if (denial) throw new Error(denial);
  const cleanTerm = term.trim();
  if (cleanTerm.length < 2) return [];
  const products = await db.producto.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: cleanTerm, mode: "insensitive" } },
        { sku: { contains: cleanTerm, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      salePrice: true,
      currentStock: true,
      category: { select: { categoryName: true } },
      presentations: {
        where: { isActive: true },
        orderBy: { unitsPerPresentation: "asc" },
        select: {
          id: true,
          name: true,
          unitsPerPresentation: true,
          salePrice: true,
          closedStock: true,
        },
      },
    },
    orderBy: { name: "asc" },
    take: 30,
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    salePrice: product.salePrice.toString(),
    currentStock: product.currentStock,
    categoryName: product.category?.categoryName ?? null,
    presentations: product.presentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      unitsPerPresentation: presentation.unitsPerPresentation,
      salePrice: presentation.salePrice.toString(),
      closedStock: presentation.closedStock,
    })),
  }));
}
export type CheckoutLine = {
  productId: string;
  /** Si viene, `quantity` cuenta presentaciones (paquetes); si no, unidades individuales. */
  presentationId?: string | null;
  quantity: number;
  discountCents?: number;
};
export async function createSale(
  lines: CheckoutLine[],
  paymentMethod: string,
  cashReceivedCents?: number,
  expectedTotalCents?: number,
) {
  const authorization = await autorizarAccion("sales:create");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  const allowedMethods = ["Efectivo", "Tarjeta", "Transferencia", "Crédito", "Otro"];
  if (!Array.isArray(lines) || !lines.length || !allowedMethods.includes(paymentMethod))
    return { ok: false, message: "Agrega productos y elige una forma de pago." };
  if (
    paymentMethod === "Efectivo" &&
    (typeof cashReceivedCents !== "number" ||
      !Number.isSafeInteger(cashReceivedCents) ||
      cashReceivedCents < 0 ||
      typeof expectedTotalCents !== "number" ||
      !Number.isSafeInteger(expectedTotalCents) ||
      expectedTotalCents < 0)
  )
    return { ok: false, message: "Ingresa el efectivo recibido para calcular el vuelto." };

  type RequestedLine = {
    productId: string;
    presentationId: string | null;
    quantity: number;
    discountCents: number;
  };
  const requested = new Map<string, RequestedLine>();
  for (const line of lines) {
    const presentationId = line.presentationId ? line.presentationId : null;
    if (!line.productId || !Number.isInteger(line.quantity) || line.quantity < 1)
      return { ok: false, message: "Revisa las cantidades del carrito." };
    const discount = line.discountCents ?? 0;
    if (!Number.isSafeInteger(discount) || discount < 0)
      return { ok: false, message: "Revisa los descuentos del carrito." };
    const key = `${line.productId}|${presentationId ?? ""}`;
    const current = requested.get(key);
    requested.set(key, {
      productId: line.productId,
      presentationId,
      quantity: (current?.quantity ?? 0) + line.quantity,
      discountCents: (current?.discountCents ?? 0) + discount,
    });
  }
  if ([...requested.values()].some((line) => line.discountCents > 0)) {
    const noDiscount =
      (await guardAccion("sales:discount")) ?? (await denialForFeature("pos-discounts"));
    if (noDiscount) return { ok: false, message: noDiscount };
  }

  try {
    const sale = await db.$transaction(async (tx) => {
      await lockCashOperations(tx);
      const session = await tx.cashSession.findFirst({
        where: { status: "OPEN" },
        select: { id: true },
      });
      if (!session) throw new Error("Debes abrir caja antes de realizar operaciones.");
      const productIds = [...new Set([...requested.values()].map((line) => line.productId))];
      const products = await tx.producto.findMany({
        where: { id: { in: productIds }, isActive: true },
        include: { presentations: { where: { isActive: true } } },
      });
      if (products.length !== productIds.length)
        throw new Error("Uno de los productos ya no está disponible.");
      const productById = new Map(products.map((product) => [product.id, product]));
      const unitsByProduct = new Map<string, number>();
      let totalCents = 0;
      const lineData = [...requested.values()].map((line) => {
        const product = productById.get(line.productId)!;
        const presentation = line.presentationId
          ? product.presentations.find((item) => item.id === line.presentationId)
          : undefined;
        if (line.presentationId && !presentation)
          throw new Error(`La presentación de ${product.name} ya no está disponible.`);
        if (presentation && line.quantity > presentation.closedStock)
          throw new Error(
            `No hay suficientes ${presentation.name.toLowerCase()} sin abrir de ${product.name}. Quedan ${presentation.closedStock}.`,
          );
        const units = presentation
          ? baseUnits(line.quantity, presentation.unitsPerPresentation)
          : line.quantity;
        const needed = (unitsByProduct.get(product.id) ?? 0) + units;
        if (product.currentStock < needed)
          throw new Error(`No hay suficiente inventario de ${product.name}.`);
        unitsByProduct.set(product.id, needed);
        const unitCents = Math.round(
          (presentation ? presentation.salePrice : product.salePrice).toNumber() * 100,
        );
        const { totalCents: lineCents, discountCents } = discountedLineCents(
          unitCents,
          line.quantity,
          line.discountCents,
        );
        totalCents += lineCents;
        return {
          product,
          presentation,
          quantity: line.quantity,
          units,
          unitCents,
          lineCents,
          discountCents,
        };
      });
      if (paymentMethod === "Efectivo" && expectedTotalCents !== totalCents)
        throw new Error("El precio de un producto cambió. Actualiza la pantalla antes de cobrar.");
      if (paymentMethod === "Efectivo" && cashReceivedCents! < totalCents)
        throw new Error("El efectivo recibido no alcanza para cobrar esta venta.");
      const createdSale = await tx.venta.create({
        data: { total: (totalCents / 100).toFixed(2), paymentMethod, source: "mostrador" },
      });
      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          saleId: createdSale.id,
          type: "SALE",
          method: cashMethodFromSale(paymentMethod),
          amount: (totalCents / 100).toFixed(2),
          description: `Venta #${createdSale.number}`,
        },
      });
      for (const item of lineData) {
        const changed = await tx.producto.updateMany({
          where: { id: item.product.id, currentStock: { gte: item.units } },
          data: { currentStock: { decrement: item.units }, updatedBy: actorId },
        });
        if (changed.count !== 1)
          throw new Error(`El inventario de ${item.product.name} cambió; intenta cobrar de nuevo.`);
        if (item.presentation) {
          const closedChanged = await tx.presentacion.updateMany({
            where: { id: item.presentation.id, closedStock: { gte: item.quantity } },
            data: { closedStock: { decrement: item.quantity } },
          });
          if (closedChanged.count !== 1)
            throw new Error(
              `Las ${item.presentation.name.toLowerCase()} de ${item.product.name} cambiaron; intenta cobrar de nuevo.`,
            );
        }
        await tx.lineaVenta.create({
          data: {
            saleId: createdSale.id,
            productId: item.product.id,
            quantity: item.units,
            unitPrice: (item.unitCents / 100).toFixed(2),
            lineTotal: (item.lineCents / 100).toFixed(2),
            discountAmount: (item.discountCents / 100).toFixed(2),
            presentationName: item.presentation?.name ?? null,
            presentationQty: item.presentation ? item.quantity : null,
            unitsPerPresentation: item.presentation?.unitsPerPresentation ?? null,
          },
        });
        await tx.movimientoStock.create({
          data: {
            productId: item.product.id,
            delta: -item.units,
            reason: "venta",
            reference: `V-${createdSale.number}`,
            note: item.presentation
              ? `${item.quantity} × ${item.presentation.name} (${item.units} unidades)`
              : null,
            createdBy: actorId,
            createdByEmail: actorEmail,
          },
        });
      }
      for (const productId of unitsByProduct.keys()) {
        const fresh = await tx.producto.findUnique({
          where: { id: productId },
          select: { currentStock: true },
        });
        await reconcileClosedStock(tx, productId, fresh?.currentStock ?? 0);
      }
      return createdSale;
    });
    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/caja");
    revalidatePath("/");
    return {
      ok: true,
      message: "Venta registrada.",
      saleNumber: sale.number,
      soldAt: sale.soldAt.toISOString(),
      totalCents: Math.round(sale.total.toNumber() * 100),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo registrar la venta.",
    };
  }
}
export async function cancelSale(id: string) {
  const authorization = await autorizarAccion("sales:void");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    await db.$transaction(async (tx) => {
      await lockCashOperations(tx);
      const sale = await tx.venta.findUnique({ where: { id }, include: { lines: true } });
      if (!sale || sale.status !== "completada")
        throw new Error("Esta venta ya fue anulada o no existe.");
      const session = await tx.cashSession.findFirst({
        where: { status: "OPEN" },
        select: { id: true },
      });
      if (!session) throw new Error("Debes abrir caja antes de registrar una devolución.");
      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          type: "REFUND",
          method: cashMethodFromSale(sale.paymentMethod),
          amount: sale.total,
          referenceId: sale.id,
          description: `Devolución de venta #${sale.number}`,
        },
      });
      await tx.venta.update({ where: { id }, data: { status: "anulada" } });
      for (const line of sale.lines) {
        await tx.producto.update({
          where: { id: line.productId },
          data: { currentStock: { increment: line.quantity }, updatedBy: actorId },
        });
        if (line.presentationName && line.presentationQty) {
          // Una caja vendida vuelve como caja sin abrir. Si ya no existe, vuelve como unidades sueltas.
          await tx.presentacion.updateMany({
            where: { productId: line.productId, name: line.presentationName },
            data: { closedStock: { increment: line.presentationQty } },
          });
        }
        await tx.movimientoStock.create({
          data: {
            productId: line.productId,
            delta: line.quantity,
            reason: "anulacion",
            reference: `V-${sale.number}`,
            createdBy: actorId,
            createdByEmail: actorEmail,
          },
        });
      }
    });
    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/caja");
    revalidatePath("/");
    return { ok: true, message: "Venta anulada e inventario restituido." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo anular la venta.",
    };
  }
}
export async function changeSalePayment(id: string, paymentMethod: string) {
  const denial = await guardAccion("sales:manage");
  if (denial) return { ok: false, message: denial };
  if (!["Efectivo", "Tarjeta", "Transferencia", "Crédito", "Otro"].includes(paymentMethod))
    return { ok: false, message: "Elige una forma de pago válida." };
  try {
    await db.$transaction(async (tx) => {
      await lockCashOperations(tx);
      const sale = await tx.venta.findUnique({
        where: { id },
        include: { cashMovement: { include: { session: true } } },
      });
      if (!sale || sale.status !== "completada")
        throw new Error("Solo puedes editar una venta completada.");
      if (
        sale.cashMovement?.session.status !== undefined &&
        sale.cashMovement.session.status !== "OPEN"
      ) {
        throw new Error(
          "No se puede cambiar el pago de una venta incluida en un cierre ya realizado.",
        );
      }
      await tx.venta.update({ where: { id }, data: { paymentMethod } });
      if (sale.cashMovement) {
        await tx.cashMovement.update({
          where: { id: sale.cashMovement.id },
          data: { method: cashMethodFromSale(paymentMethod) },
        });
      }
    });
    revalidatePath("/ventas");
    revalidatePath("/caja");
    revalidatePath("/");
    return { ok: true, message: "Forma de pago actualizada." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar la forma de pago.",
    };
  }
}
export type PurchaseInput = {
  supplierName: string;
  reference?: string;
  note?: string;
  purchasedAt: string;
  /**
   * Si viene `presentationId`, `quantity` cuenta presentaciones (por ejemplo 3 cajas) y
   * `unitCost` es el costo de UNA presentación. Si no, son unidades individuales.
   */
  lines: Array<{
    productId: string;
    presentationId?: string | null;
    quantity: number;
    unitCost: number;
  }>;
};
type ParsedPurchaseLine = {
  productId: string;
  presentationId: string | null;
  quantity: number;
  unitCost: number;
};
function purchaseInput(input: PurchaseInput) {
  const supplierName = input.supplierName.trim();
  const purchasedAt = new Date(input.purchasedAt);
  if (
    !supplierName ||
    Number.isNaN(purchasedAt.getTime()) ||
    !Array.isArray(input.lines) ||
    !input.lines.length
  ) {
    throw new Error("Indica el proveedor, la fecha y al menos un producto.");
  }
  const lines = new Map<string, ParsedPurchaseLine>();
  for (const line of input.lines) {
    const presentationId = line.presentationId ? line.presentationId : null;
    if (
      !line.productId ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isFinite(line.unitCost) ||
      line.unitCost < 0
    ) {
      throw new Error("Revisa las cantidades y los costos de los productos.");
    }
    const key = `${line.productId}|${presentationId ?? ""}`;
    const current = lines.get(key);
    lines.set(key, {
      productId: line.productId,
      presentationId,
      quantity: (current?.quantity ?? 0) + line.quantity,
      unitCost: line.unitCost,
    });
  }
  return {
    supplierName,
    purchasedAt,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    lines,
  };
}

type ClosedChange = { productId: string; name: string; qty: number };

/** Valida productos y presentaciones y calcula unidades, líneas a guardar y presentaciones sin abrir. */
async function resolvePurchaseLines(
  tx: Prisma.TransactionClient,
  lines: Map<string, ParsedPurchaseLine>,
  requireActive: boolean,
) {
  const parsedLines = [...lines.values()];
  const productIds = [...new Set(parsedLines.map((line) => line.productId))];
  const presentationIds = [
    ...new Set(parsedLines.flatMap((line) => (line.presentationId ? [line.presentationId] : []))),
  ];
  const products = await tx.producto.findMany({
    where: { id: { in: productIds }, ...(requireActive ? { isActive: true } : {}) },
    select: { id: true },
  });
  if (products.length !== productIds.length)
    throw new Error("Uno de los productos ya no está disponible.");
  const presentations = presentationIds.length
    ? await tx.presentacion.findMany({
        where: { id: { in: presentationIds }, isActive: true },
        select: { id: true, productId: true, name: true, unitsPerPresentation: true },
      })
    : [];
  const presentationById = new Map(presentations.map((item) => [item.id, item]));
  const unitsByProduct = new Map<string, number>();
  const closedByKey = new Map<string, ClosedChange>();
  const lineData = parsedLines.map((line) => {
    const presentation = line.presentationId
      ? presentationById.get(line.presentationId)
      : undefined;
    if (line.presentationId && (!presentation || presentation.productId !== line.productId))
      throw new Error("Una de las presentaciones ya no está disponible.");
    const units = presentation
      ? baseUnits(line.quantity, presentation.unitsPerPresentation)
      : line.quantity;
    unitsByProduct.set(line.productId, (unitsByProduct.get(line.productId) ?? 0) + units);
    if (presentation) {
      const key = `${line.productId}|${presentation.name}`;
      closedByKey.set(key, {
        productId: line.productId,
        name: presentation.name,
        qty: (closedByKey.get(key)?.qty ?? 0) + line.quantity,
      });
    }
    return {
      productId: line.productId,
      quantity: units,
      unitCost: line.unitCost.toFixed(2),
      lineTotal: (line.quantity * line.unitCost).toFixed(2),
      presentationName: presentation?.name ?? null,
      presentationQty: presentation ? line.quantity : null,
      unitsPerPresentation: presentation?.unitsPerPresentation ?? null,
    };
  });
  return { lineData, unitsByProduct, closedByKey };
}

/** Las presentaciones compradas entran sin abrir; si se reduce una compra, salen de las sin abrir. */
async function applyPurchaseClosed(
  tx: Prisma.TransactionClient,
  deltas: Map<string, ClosedChange>,
) {
  for (const { productId, name, qty } of deltas.values()) {
    if (!qty) continue;
    if (qty > 0) {
      await tx.presentacion.updateMany({
        where: { productId, name },
        data: { closedStock: { increment: qty } },
      });
      continue;
    }
    const exists = await tx.presentacion.findUnique({
      where: { productId_name: { productId, name } },
      select: { id: true },
    });
    if (!exists) continue;
    const changed = await tx.presentacion.updateMany({
      where: { productId, name, closedStock: { gte: -qty } },
      data: { closedStock: { decrement: -qty } },
    });
    if (changed.count !== 1)
      throw new Error(
        `No puedes reducir esta compra: ya se vendieron o abrieron ${name.toLowerCase()} de ese producto.`,
      );
  }
}
async function applyPurchaseStock(
  tx: Prisma.TransactionClient,
  deltas: Map<string, number>,
  reference: string,
  actorId: string,
  actorEmail: string,
) {
  for (const [productId, delta] of deltas) {
    if (!delta) continue;
    const changed = await tx.producto.updateMany({
      where: delta < 0 ? { id: productId, currentStock: { gte: -delta } } : { id: productId },
      data: { currentStock: { increment: delta }, updatedBy: actorId },
    });
    if (changed.count !== 1)
      throw new Error(
        "No puedes reducir una compra porque dejaría el inventario por debajo de cero.",
      );
    if (delta < 0) {
      const fresh = await tx.producto.findUnique({
        where: { id: productId },
        select: { currentStock: true },
      });
      await reconcileClosedStock(tx, productId, fresh?.currentStock ?? 0);
    }
    await tx.movimientoStock.create({
      data: {
        productId,
        delta,
        reason: delta > 0 ? "compra" : "correccion_compra",
        reference,
        createdBy: actorId,
        createdByEmail: actorEmail,
      },
    });
  }
}
export async function createPurchase(input: PurchaseInput) {
  const authorization = await autorizarAccion("purchases:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const off = await denialForFeature("purchases");
  if (off) return { ok: false, message: off };
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    const purchase = await db.$transaction(async (tx) => {
      const parsed = purchaseInput(input);
      const resolved = await resolvePurchaseLines(tx, parsed.lines, true);
      const total = resolved.lineData.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const created = await tx.compra.create({
        data: {
          supplierName: parsed.supplierName,
          reference: parsed.reference,
          note: parsed.note,
          purchasedAt: parsed.purchasedAt,
          total: total.toFixed(2),
          lines: { create: resolved.lineData },
        },
      });
      await applyPurchaseClosed(tx, resolved.closedByKey);
      await applyPurchaseStock(
        tx,
        resolved.unitsByProduct,
        `C-${created.number}`,
        actorId,
        actorEmail,
      );
      return created;
    });
    revalidatePath("/compras");
    revalidatePath("/inventario");
    revalidatePath("/");
    return {
      ok: true,
      message: `Compra C-${purchase.number} registrada e inventario actualizado.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo registrar la compra.",
    };
  }
}
export async function updatePurchase(id: string, input: PurchaseInput) {
  const authorization = await autorizarAccion("purchases:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const off = await denialForFeature("purchases");
  if (off) return { ok: false, message: off };
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    await db.$transaction(async (tx) => {
      const parsed = purchaseInput(input);
      const existing = await tx.compra.findUnique({ where: { id }, include: { lines: true } });
      if (!existing) throw new Error("No encontramos esta compra.");
      const resolved = await resolvePurchaseLines(tx, parsed.lines, false);

      const priorUnits = new Map<string, number>();
      const priorClosed = new Map<string, ClosedChange>();
      for (const line of existing.lines) {
        priorUnits.set(line.productId, (priorUnits.get(line.productId) ?? 0) + line.quantity);
        if (line.presentationName && line.presentationQty) {
          const key = `${line.productId}|${line.presentationName}`;
          priorClosed.set(key, {
            productId: line.productId,
            name: line.presentationName,
            qty: (priorClosed.get(key)?.qty ?? 0) + line.presentationQty,
          });
        }
      }
      const productIds = new Set([...resolved.unitsByProduct.keys(), ...priorUnits.keys()]);
      const unitDeltas = new Map(
        [...productIds].map((productId) => [
          productId,
          (resolved.unitsByProduct.get(productId) ?? 0) - (priorUnits.get(productId) ?? 0),
        ]),
      );
      const closedKeys = new Set([...resolved.closedByKey.keys(), ...priorClosed.keys()]);
      const closedDeltas = new Map<string, ClosedChange>();
      for (const key of closedKeys) {
        const next = resolved.closedByKey.get(key);
        const prior = priorClosed.get(key);
        const base = next ?? prior!;
        closedDeltas.set(key, {
          productId: base.productId,
          name: base.name,
          qty: (next?.qty ?? 0) - (prior?.qty ?? 0),
        });
      }

      // Primero las presentaciones sin abrir y después el total de unidades: así el stock
      // y lo que hay sin abrir se mantienen coherentes.
      await applyPurchaseClosed(tx, closedDeltas);
      await applyPurchaseStock(tx, unitDeltas, `C-${existing.number}`, actorId, actorEmail);
      await tx.compra.update({
        where: { id },
        data: {
          supplierName: parsed.supplierName,
          reference: parsed.reference,
          note: parsed.note,
          purchasedAt: parsed.purchasedAt,
          total: resolved.lineData
            .reduce((sum, line) => sum + Number(line.lineTotal), 0)
            .toFixed(2),
          lines: { deleteMany: {}, create: resolved.lineData },
        },
      });
    });
    revalidatePath("/compras");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: "Compra actualizada e inventario corregido." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar la compra.",
    };
  }
}
function supplierInput(formData: FormData) {
  const name = text(formData.get("name"));
  if (!name) throw new Error("Indica el nombre del proveedor.");
  return {
    name,
    contactName: text(formData.get("contactName")) || null,
    phone: text(formData.get("phone")) || null,
    email: text(formData.get("email")) || null,
    taxId: text(formData.get("taxId")) || null,
    address: text(formData.get("address")) || null,
    paymentTerms: text(formData.get("paymentTerms")) || null,
    notes: text(formData.get("notes")) || null,
    isActive: formData.get("isActive") === "on",
  };
}
export async function createSupplier(formData: FormData) {
  const denial = await guardAccion("suppliers:manage");
  if (denial) return { ok: false, message: denial };
  const off = await denialForFeature("suppliers");
  if (off) return { ok: false, message: off };
  try {
    await db.proveedor.create({ data: supplierInput(formData) });
    revalidatePath("/proveedores");
    return { ok: true, message: "Proveedor agregado." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el proveedor.",
    };
  }
}
export async function updateSupplier(id: string, formData: FormData) {
  const denial = await guardAccion("suppliers:manage");
  if (denial) return { ok: false, message: denial };
  const off = await denialForFeature("suppliers");
  if (off) return { ok: false, message: off };
  try {
    await db.proveedor.update({ where: { id }, data: supplierInput(formData) });
    revalidatePath("/proveedores");
    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el proveedor.",
    };
  }
}
function supplierPriceInput(formData: FormData) {
  const supplierId = text(formData.get("supplierId"));
  const productId = text(formData.get("productId"));
  const unitCost = Number(text(formData.get("unitCost")));
  const minimumQuantity = Number(text(formData.get("minimumQuantity")) || 1);
  if (
    !supplierId ||
    !productId ||
    !Number.isFinite(unitCost) ||
    unitCost < 0 ||
    !Number.isInteger(minimumQuantity) ||
    minimumQuantity < 1
  ) {
    throw new Error("Elige el proveedor y producto, e indica un precio y cantidad mínima válidos.");
  }
  return {
    supplierId,
    productId,
    unitCost: unitCost.toFixed(2),
    minimumQuantity,
    note: text(formData.get("note")) || null,
  };
}
export async function createSupplierPrice(formData: FormData) {
  const denial = await guardAccion("prices:manage");
  if (denial) return { ok: false, message: denial };
  try {
    const input = supplierPriceInput(formData);
    await db.precioProveedor.create({ data: input });
    revalidatePath("/comparar-precios");
    return { ok: true, message: "Precio registrado para comparar." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el precio.",
    };
  }
}
export async function updateSupplierPrice(id: string, formData: FormData) {
  const denial = await guardAccion("prices:manage");
  if (denial) return { ok: false, message: denial };
  try {
    const input = supplierPriceInput(formData);
    await db.precioProveedor.update({ where: { id }, data: input });
    revalidatePath("/comparar-precios");
    return { ok: true, message: "Precio actualizado." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el precio.",
    };
  }
}
function customerInput(formData: FormData) {
  const name = text(formData.get("name"));
  if (!name) throw new Error("Indica el nombre del cliente.");
  return {
    name,
    phone: text(formData.get("phone")) || null,
    email: text(formData.get("email")) || null,
    notes: text(formData.get("notes")) || null,
    isActive: formData.get("isActive") === "on",
  };
}
export async function createCustomer(formData: FormData) {
  const denial = await guardAccion("customers:manage");
  if (denial) return { ok: false, message: denial };
  const off = await denialForFeature("customers");
  if (off) return { ok: false, message: off };
  try {
    await db.cliente.create({ data: customerInput(formData) });
    revalidatePath("/clientes");
    return { ok: true, message: "Cliente agregado." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el cliente.",
    };
  }
}
export async function updateCustomer(id: string, formData: FormData) {
  const denial = await guardAccion("customers:manage");
  if (denial) return { ok: false, message: denial };
  const off = await denialForFeature("customers");
  if (off) return { ok: false, message: off };
  try {
    await db.cliente.update({ where: { id }, data: customerInput(formData) });
    revalidatePath("/clientes");
    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el cliente.",
    };
  }
}
