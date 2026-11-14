const STOPWORDS = new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "EL",
  "LOS",
  "UN",
  "UNA",
  "UNOS",
  "UNAS",
  "Y",
  "E",
  "O",
  "U",
  "A",
  "AL",
  "EN",
  "CON",
  "SIN",
  "PARA",
  "POR",
]);

function words(text: string | null | undefined): string[] {
  return (
    (text ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .match(/[A-Z0-9]+/g) ?? []
  );
}

/** Clasificación: primeras 3 letras de la primera palabra de la categoría. */
export function categorySkuPrefix(categoryName: string | null) {
  return words(categoryName)[0]?.slice(0, 3) || "GEN";
}

/** Lo que ES el producto: primeras 3 letras de la primera palabra útil del nombre. */
export function productTypeSkuPart(productName: string | null | undefined) {
  const useful = words(productName).filter((word) => !STOPWORDS.has(word));
  const word = useful.find((item) => /[A-Z]/.test(item)) ?? useful[0];
  return word ? word.slice(0, 3) : "";
}

/** CLASIFICACIÓN-TIPO, por ejemplo UTI-LAP. Sin nombre todavía, solo la clasificación. */
export function productSkuPrefix(
  categoryName: string | null,
  productName: string | null | undefined,
) {
  const category = categorySkuPrefix(categoryName);
  const type = productTypeSkuPart(productName);
  return type ? `${category}-${type}` : category;
}

/** Número de registro: el primer número libre dentro del prefijo. UTI-LAP-001, UTI-LAP-002… */
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

/** Código escrito a mano: sin espacios, en mayúsculas y con caracteres seguros. */
export function normalizeManualSku(raw: string) {
  const sku = raw.trim().replace(/\s+/g, "-").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(sku)) {
    throw new Error(
      "El código debe tener de 2 a 40 caracteres: letras, números, guion, punto o diagonal.",
    );
  }
  return sku;
}
