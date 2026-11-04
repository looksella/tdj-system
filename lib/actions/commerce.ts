"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { autorizarAccion, guardAccion } from "@/lib/guard-autorizacion";
import { cashMethodFromSale, lockCashOperations } from "@/lib/caja";
import { categorySkuPrefix, nextAvailableProductSku } from "@/lib/product-sku";
function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
function productInput(formData: FormData, generatedSku?: string) {
  const sku = generatedSku ?? text(formData.get("sku"));
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

async function nextProductSku(tx: Prisma.TransactionClient, categoryId: string) {
  const category = categoryId
    ? await tx.categoria.findUnique({ where: { id: categoryId }, select: { categoryName: true } })
    : null;
  if (categoryId && !category) throw new Error("La categoría seleccionada no existe.");

  const prefix = categorySkuPrefix(category?.categoryName ?? null);
  const existingSkus = await tx.producto.findMany({
    where: { sku: { startsWith: `${prefix}-` } },
    select: { sku: true },
  });
  return nextAvailableProductSku(
    prefix,
    existingSkus.map(({ sku }) => sku),
  );
}

export async function suggestProductSku(categoryId: string) {
  const denial = await guardAccion("inventory:manage");
  if (denial) return { ok: false as const, message: denial };
  try {
    const sku = await db.$transaction((tx) => nextProductSku(tx, categoryId.trim()));
    return { ok: true as const, sku };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo generar el código.",
    };
  }
}

export async function createProduct(formData: FormData) {
  const authorization = await autorizarAccion("inventory:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    const initialStock = Number(text(formData.get("initialStock")) || 0);
    if (!Number.isInteger(initialStock) || initialStock < 0) {
      throw new Error("La cantidad inicial debe ser un número entero de cero o más.");
    }
    const categoryId = text(formData.get("categoryId"));
    let sku = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        sku = await db.$transaction(async (tx) => {
          const generatedSku = await nextProductSku(tx, categoryId);
          const product = await tx.producto.create({
            data: {
              ...productInput(formData, generatedSku),
              currentStock: initialStock,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
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
          return generatedSku;
        });
        break;
      } catch (error) {
        const isSkuCollision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!isSkuCollision || attempt === 4) throw error;
      }
    }
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: `Producto agregado al inventario con el código ${sku}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el producto.",
    };
  }
}
export async function updateProduct(id: string, formData: FormData) {
  const authorization = await autorizarAccion("inventory:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
  try {
    await db.producto.update({
      where: { id },
      data: { ...productInput(formData), updatedBy: authorization.usuario.id },
    });
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
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
export async function adjustStock(id: string, delta: number, note: string) {
  const authorization = await autorizarAccion("inventory:manage");
  if (!authorization.usuario) return { ok: false, message: authorization.denial };
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
  }));
}
export type CheckoutLine = { productId: string; quantity: number };
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
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!line.productId || !Number.isInteger(line.quantity) || line.quantity < 1)
      return { ok: false, message: "Revisa las cantidades del carrito." };
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  try {
    const sale = await db.$transaction(async (tx) => {
      await lockCashOperations(tx);
      const session = await tx.cashSession.findFirst({
        where: { status: "OPEN" },
        select: { id: true },
      });
      if (!session) throw new Error("Debes abrir caja antes de realizar operaciones.");
      const products = await tx.producto.findMany({
        where: { id: { in: [...quantities.keys()] }, isActive: true },
      });
      if (products.length !== quantities.size)
        throw new Error("Uno de los productos ya no está disponible.");
      let totalCents = 0;
      const lineData = products.map((product) => {
        const quantity = quantities.get(product.id)!;
        if (product.currentStock < quantity)
          throw new Error(`No hay suficiente inventario de ${product.name}.`);
        const unitCents = Math.round(product.salePrice.toNumber() * 100);
        const lineCents = unitCents * quantity;
        totalCents += lineCents;
        return { product, quantity, unitCents, lineCents };
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
          where: { id: item.product.id, currentStock: { gte: item.quantity } },
          data: { currentStock: { decrement: item.quantity }, updatedBy: actorId },
        });
        if (changed.count !== 1)
          throw new Error(`El inventario de ${item.product.name} cambió; intenta cobrar de nuevo.`);
        await tx.lineaVenta.create({
          data: {
            saleId: createdSale.id,
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: (item.unitCents / 100).toFixed(2),
            lineTotal: (item.lineCents / 100).toFixed(2),
          },
        });
        await tx.movimientoStock.create({
          data: {
            productId: item.product.id,
            delta: -item.quantity,
            reason: "venta",
            reference: `V-${createdSale.number}`,
            createdBy: actorId,
            createdByEmail: actorEmail,
          },
        });
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
  const authorization = await autorizarAccion("sales:manage");
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
  lines: Array<{ productId: string; quantity: number; unitCost: number }>;
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
  const lines = new Map<string, { quantity: number; unitCost: number }>();
  for (const line of input.lines) {
    if (
      !line.productId ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isFinite(line.unitCost) ||
      line.unitCost < 0
    ) {
      throw new Error("Revisa las cantidades y los costos de los productos.");
    }
    const current = lines.get(line.productId);
    lines.set(line.productId, {
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
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    const purchase = await db.$transaction(async (tx) => {
      const parsed = purchaseInput(input);
      const productIds = [...parsed.lines.keys()];
      const products = await tx.producto.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true },
      });
      if (products.length !== productIds.length)
        throw new Error("Uno de los productos ya no está disponible.");
      const lineData = [...parsed.lines.entries()].map(([productId, line]) => ({
        productId,
        quantity: line.quantity,
        unitCost: line.unitCost.toFixed(2),
        lineTotal: (line.quantity * line.unitCost).toFixed(2),
      }));
      const total = lineData.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const created = await tx.compra.create({
        data: {
          supplierName: parsed.supplierName,
          reference: parsed.reference,
          note: parsed.note,
          purchasedAt: parsed.purchasedAt,
          total: total.toFixed(2),
          lines: { create: lineData },
        },
      });
      await applyPurchaseStock(
        tx,
        new Map(lineData.map((line) => [line.productId, line.quantity])),
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
  const actorId = authorization.usuario.id;
  const actorEmail = authorization.usuario.email || actorId;
  try {
    await db.$transaction(async (tx) => {
      const parsed = purchaseInput(input);
      const existing = await tx.compra.findUnique({ where: { id }, include: { lines: true } });
      if (!existing) throw new Error("No encontramos esta compra.");
      const productIds = [
        ...new Set([...parsed.lines.keys(), ...existing.lines.map((line) => line.productId)]),
      ];
      const products = await tx.producto.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length)
        throw new Error("Uno de los productos ya no está disponible.");
      const lineData = [...parsed.lines.entries()].map(([productId, line]) => ({
        productId,
        quantity: line.quantity,
        unitCost: line.unitCost.toFixed(2),
        lineTotal: (line.quantity * line.unitCost).toFixed(2),
      }));
      const prior = new Map(existing.lines.map((line) => [line.productId, line.quantity]));
      const deltas = new Map(
        productIds.map((productId) => [
          productId,
          (parsed.lines.get(productId)?.quantity ?? 0) - (prior.get(productId) ?? 0),
        ]),
      );
      await applyPurchaseStock(tx, deltas, `C-${existing.number}`, actorId, actorEmail);
      await tx.compra.update({
        where: { id },
        data: {
          supplierName: parsed.supplierName,
          reference: parsed.reference,
          note: parsed.note,
          purchasedAt: parsed.purchasedAt,
          total: lineData.reduce((sum, line) => sum + Number(line.lineTotal), 0).toFixed(2),
          lines: { deleteMany: {}, create: lineData },
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
