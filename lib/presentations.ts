/** Precio por unidad sugerido a partir del paquete. Redondea hacia arriba al centavo. */
export function suggestUnitPriceCents(packageCents: number, unitsPerPackage: number): number {
  if (!Number.isSafeInteger(packageCents) || packageCents < 0) return 0;
  if (!Number.isInteger(unitsPerPackage) || unitsPerPackage < 2) return 0;
  return Math.ceil(packageCents / unitsPerPackage);
}

/** Precio del paquete sugerido a partir del precio individual (unidad × cantidad). */
export function suggestPackagePriceCents(unitCents: number, unitsPerPackage: number): number {
  if (!Number.isSafeInteger(unitCents) || unitCents < 0) return 0;
  if (!Number.isInteger(unitsPerPackage) || unitsPerPackage < 2) return 0;
  return unitCents * unitsPerPackage;
}

/** Unidades individuales que descuenta vender `quantity` presentaciones. */
export function baseUnits(quantity: number, unitsPerPresentation: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("La cantidad no es válida.");
  if (!Number.isInteger(unitsPerPresentation) || unitsPerPresentation < 1) {
    throw new Error("La presentación no es válida.");
  }
  const units = quantity * unitsPerPresentation;
  if (!Number.isSafeInteger(units)) throw new Error("La cantidad es demasiado grande.");
  return units;
}

/** Cuántas presentaciones completas alcanzan con las existencias actuales. */
export function maxPresentations(currentStock: number, unitsPerPresentation: number): number {
  if (!Number.isInteger(unitsPerPresentation) || unitsPerPresentation < 1) return 0;
  return Math.floor(Math.max(0, currentStock) / unitsPerPresentation);
}

/** 125 unidades en paquetes de 10 -> { packages: 12, loose: 5 } (solo como referencia) */
export function stockBreakdown(currentStock: number, unitsPerPackage: number) {
  const stock = Math.max(0, Math.floor(currentStock));
  if (!Number.isInteger(unitsPerPackage) || unitsPerPackage < 2)
    return { packages: 0, loose: stock };
  return { packages: Math.floor(stock / unitsPerPackage), loose: stock % unitsPerPackage };
}

/** ¿El precio de la presentación queda por debajo de su costo? (costo por unidad × unidades) */
export function isBelowCost(
  priceCents: number,
  unitCostCents: number,
  unitsPerPresentation: number,
): boolean {
  return unitCostCents * unitsPerPresentation > priceCents;
}

/* ---------- Presentaciones cerradas y unidades sueltas ---------- */

/** Una presentación y cuántas hay CERRADAS (sin abrir). */
export type ClosedItem = { id: string; unitsPerPresentation: number; closed: number };

/** Unidades que están dentro de presentaciones cerradas. */
export function closedUnits(items: readonly ClosedItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.closed) * item.unitsPerPresentation, 0);
}

/**
 * Unidades sueltas = total − unidades dentro de presentaciones cerradas.
 * Un resultado negativo significa que hay más cerradas de las que alcanzan.
 */
export function looseUnits(totalUnits: number, items: readonly ClosedItem[]): number {
  return Math.max(0, Math.floor(totalUnits)) - closedUnits(items);
}

/**
 * Cuando el total baja (una venta suelta, un ajuste), si las sueltas no alcanzan
 * se abren presentaciones cerradas, empezando por las más pequeñas.
 * Ej.: 2 cajas de 60 (120 en total) y se venden 10 sueltos -> total 110 -> queda 1 caja cerrada.
 */
export function normalizeClosed(totalUnits: number, items: readonly ClosedItem[]): ClosedItem[] {
  const next = items.map((item) => ({ ...item, closed: Math.max(0, Math.floor(item.closed)) }));
  let excess = closedUnits(next) - Math.max(0, Math.floor(totalUnits));
  if (excess <= 0) return next;
  const smallestFirst = [...next].sort((a, b) => a.unitsPerPresentation - b.unitsPerPresentation);
  for (const item of smallestFirst) {
    if (excess <= 0) break;
    if (item.unitsPerPresentation < 1 || item.closed === 0) continue;
    const toOpen = Math.min(item.closed, Math.ceil(excess / item.unitsPerPresentation));
    item.closed -= toOpen;
    excess -= toOpen * item.unitsPerPresentation;
  }
  return next;
}