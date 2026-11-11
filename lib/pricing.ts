export function discountedLineCents(unitCents: number, quantity: number, discountCents = 0) {
  const subtotalCents = unitCents * quantity;
  if (!Number.isSafeInteger(discountCents) || discountCents < 0) {
    throw new Error("El descuento no es válido.");
  }
  if (discountCents > subtotalCents) {
    throw new Error("El descuento no puede ser mayor al subtotal de la línea.");
  }
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

/** "1.50" -> 150. Devuelve null si el texto no es un monto válido con máximo 2 decimales. */
export function dollarsToCents(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}