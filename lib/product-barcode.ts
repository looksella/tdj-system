const BARCODE_PATTERN = /^[a-zA-Z0-9]{4,64}$/;

export function isBarcodeFormatValid(value: string): boolean {
  return BARCODE_PATTERN.test(value.trim());
}

export function parseBarcode(value: string): string | null {
  const barcode = value.trim();
  if (!barcode) return null;
  if (!isBarcodeFormatValid(barcode)) {
    throw new Error("El código de barras debe tener entre 4 y 64 letras o números.");
  }
  return barcode;
}
