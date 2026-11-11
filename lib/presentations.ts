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

/** 125 unidades en paquetes de 10 -> { packages: 12, loose: 5 } */
export function stockBreakdown(currentStock: number, unitsPerPackage: number) {
  const stock = Math.max(0, Math.floor(currentStock));
  if (!Number.isInteger(unitsPerPackage) || unitsPerPackage < 2) return { packages: 0, loose: stock };
  return { packages: Math.floor(stock / unitsPerPackage), loose: stock % unitsPerPackage };
}

/** ¿El precio de la presentación queda por debajo de su costo? (costo por unidad × unidades) */
export function isBelowCost(priceCents: number, unitCostCents: number, unitsPerPresentation: number): boolean {
  return unitCostCents * unitsPerPresentation > priceCents;
}