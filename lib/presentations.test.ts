import { describe, expect, it } from "vitest";
import {
  baseUnits,
  isBelowCost,
  maxPresentations,
  stockBreakdown,
  suggestPackagePriceCents,
  suggestUnitPriceCents,
} from "./presentations";

describe("presentaciones", () => {
  it("sugiere el precio por unidad redondeando hacia arriba", () => {
    expect(suggestUnitPriceCents(800, 10)).toBe(80);
    expect(suggestUnitPriceCents(1000, 12)).toBe(84);
    expect(suggestUnitPriceCents(800, 1)).toBe(0);
  });
  it("sugiere el precio del paquete", () => {
    expect(suggestPackagePriceCents(80, 10)).toBe(800);
    expect(suggestPackagePriceCents(80, 1)).toBe(0);
  });
  it("calcula las unidades que descuenta una venta", () => {
    expect(baseUnits(3, 10)).toBe(30);
    expect(baseUnits(2, 1)).toBe(2);
    expect(() => baseUnits(0, 10)).toThrow();
    expect(() => baseUnits(1.5, 10)).toThrow();
    expect(() => baseUnits(1, 0)).toThrow();
  });
  it("calcula cuántos paquetes alcanzan", () => {
    expect(maxPresentations(125, 10)).toBe(12);
    expect(maxPresentations(9, 10)).toBe(0);
    expect(maxPresentations(-5, 10)).toBe(0);
  });
  it("separa paquetes y sueltos", () => {
    expect(stockBreakdown(125, 10)).toEqual({ packages: 12, loose: 5 });
    expect(stockBreakdown(7, 10)).toEqual({ packages: 0, loose: 7 });
    expect(stockBreakdown(7, 1)).toEqual({ packages: 0, loose: 7 });
  });
  it("avisa cuando el precio queda bajo el costo", () => {
    expect(isBelowCost(700, 80, 10)).toBe(true);
    expect(isBelowCost(800, 80, 10)).toBe(false);
  });
});