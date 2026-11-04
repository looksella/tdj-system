import { describe, expect, it } from "vitest";
import { categorySkuPrefix, nextAvailableProductSku } from "./product-sku";

describe("categorySkuPrefix", () => {
  it("normalizes accents and uses the first category word", () => {
    expect(categorySkuPrefix("Útiles escolares")).toBe("UTI");
    expect(categorySkuPrefix(null)).toBe("GEN");
  });
});

describe("nextAvailableProductSku", () => {
  it("reuses the first free sequence number", () => {
    expect(nextAvailableProductSku("UTI", ["UTI-001", "UTI-003", "OTR-001"])).toBe("UTI-002");
  });

  it("escapes a prefix before matching existing SKUs", () => {
    expect(nextAvailableProductSku("A.", ["A.-001", "AX-002"])).toBe("A.-002");
  });
});
