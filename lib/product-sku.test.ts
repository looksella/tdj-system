import { describe, expect, it } from "vitest";
import {
  categorySkuPrefix,
  nextAvailableProductSku,
  normalizeManualSku,
  productSkuPrefix,
  productTypeSkuPart,
} from "./product-sku";

describe("categorySkuPrefix", () => {
  it("normalizes accents and uses the first category word", () => {
    expect(categorySkuPrefix("Útiles escolares")).toBe("UTI");
    expect(categorySkuPrefix(null)).toBe("GEN");
  });
});

describe("productTypeSkuPart", () => {
  it("usa la primera palabra útil del nombre", () => {
    expect(productTypeSkuPart("Lápiz Mongol 2")).toBe("LAP");
    expect(productTypeSkuPart("Papel de regalo")).toBe("PAP");
    expect(productTypeSkuPart("Ñandú")).toBe("NAN");
  });
  it("salta artículos y preposiciones", () => {
    expect(productTypeSkuPart("De la casa")).toBe("CAS");
  });
  it("prefiere una palabra con letras sobre un número", () => {
    expect(productTypeSkuPart("12 lápices")).toBe("LAP");
  });
  it("devuelve vacío si todavía no hay nombre", () => {
    expect(productTypeSkuPart("")).toBe("");
    expect(productTypeSkuPart(null)).toBe("");
  });
});

describe("productSkuPrefix", () => {
  it("une clasificación y tipo", () => {
    expect(productSkuPrefix("Útiles escolares", "Lápiz Mongol")).toBe("UTI-LAP");
    expect(productSkuPrefix(null, "Lápiz")).toBe("GEN-LAP");
  });
  it("sin nombre deja solo la clasificación", () => {
    expect(productSkuPrefix("Útiles escolares", "")).toBe("UTI");
  });
});

describe("nextAvailableProductSku", () => {
  it("reuses the first free sequence number", () => {
    expect(nextAvailableProductSku("UTI", ["UTI-001", "UTI-003", "OTR-001"])).toBe("UTI-002");
  });
  it("escapes a prefix before matching existing SKUs", () => {
    expect(nextAvailableProductSku("A.", ["A.-001", "AX-002"])).toBe("A.-002");
  });
  it("cuenta el número solo dentro del mismo prefijo clasificación-tipo", () => {
    expect(
      nextAvailableProductSku("UTI-LAP", ["UTI-LAP-001", "UTI-LAP-003", "UTI-001", "UTI-BOR-001"]),
    ).toBe("UTI-LAP-002");
  });
});

describe("normalizeManualSku", () => {
  it("limpia espacios y pasa a mayúsculas", () => {
    expect(normalizeManualSku(" uti lap 001 ")).toBe("UTI-LAP-001");
  });
  it("rechaza códigos demasiado cortos o con símbolos raros", () => {
    expect(() => normalizeManualSku("a")).toThrow();
    expect(() => normalizeManualSku("UTI#001")).toThrow();
    expect(() => normalizeManualSku("")).toThrow();
  });
});