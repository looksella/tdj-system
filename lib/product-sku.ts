export function categorySkuPrefix(categoryName: string | null) {
  const firstWord = categoryName
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/[A-Z0-9]+/)?.[0];
  return firstWord?.slice(0, 3) || "GEN";
}

export function nextAvailableProductSku(prefix: string, existingSkus: string[]) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);
  const usedNumbers = new Set(
    existingSkus
      .map((sku) => pattern.exec(sku)?.[1])
      .filter((number): number is string => Boolean(number))
      .map(Number),
  );
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}
