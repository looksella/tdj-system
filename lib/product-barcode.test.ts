import { describe, expect, it } from "vitest";
import { isBarcodeFormatValid, parseBarcode } from "./product-barcode";

describe("parseBarcode", () => {
  it("normaliza un código alfanumérico válido", () => {
    expect(parseBarcode("  EAN13A8  ")).toBe("EAN13A8");
  });

  it("guarda como null un campo opcional vacío", () => {
    expect(parseBarcode("   ")).toBeNull();
  });

  it("rechaza códigos con longitud o caracteres inválidos", () => {
    expect(isBarcodeFormatValid("abc")).toBe(false);
    expect(isBarcodeFormatValid("ABC-1234")).toBe(false);
    expect(isBarcodeFormatValid("a".repeat(65))).toBe(false);
    expect(() => parseBarcode("ABC-1234")).toThrow(
      "El código de barras debe tener entre 4 y 64 letras o números.",
    );
  });
});
