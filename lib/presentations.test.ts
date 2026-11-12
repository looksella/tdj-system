import { describe, expect, it } from "vitest";
import {
  baseUnits,
  closedUnits,
  isBelowCost,
  looseUnits,
  maxPresentations,
  normalizeClosed,
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

describe("presentaciones cerradas y sueltas", () => {
  const caja = (closed: number) => ({ id: "caja", unitsPerPresentation: 60, closed });

  it("calcula unidades cerradas y sueltas", () => {
    expect(closedUnits([caja(1)])).toBe(60);
    expect(looseUnits(110, [caja(1)])).toBe(50);
    expect(looseUnits(120, [caja(2)])).toBe(0);
  });
  it("marca como inválido cuando hay más cerradas de las que alcanzan", () => {
    expect(looseUnits(100, [caja(2)])).toBeLessThan(0);
  });
  it("ejemplo del consomé: 2 cajas, se venden 10 sueltos, queda 1 caja cerrada", () => {
    const result = normalizeClosed(110, [caja(2)]);
    expect(result[0].closed).toBe(1);
    expect(looseUnits(110, result)).toBe(50);
  });
  it("no abre cajas si alcanzan las sueltas", () => {
    expect(normalizeClosed(110, [caja(1)])[0].closed).toBe(1);
    expect(normalizeClosed(60, [caja(1)])[0].closed).toBe(1);
  });
  it("abre la caja cuando ya no alcanzan las sueltas", () => {
    expect(normalizeClosed(59, [caja(1)])[0].closed).toBe(0);
  });
  it("abre primero la presentación más pequeña", () => {
    const items = [
      { id: "caja", unitsPerPresentation: 60, closed: 1 },
      { id: "paquete", unitsPerPresentation: 12, closed: 2 },
    ];
    const result = normalizeClosed(79, items);
    expect(result.find((item) => item.id === "paquete")?.closed).toBe(1);
    expect(result.find((item) => item.id === "caja")?.closed).toBe(1);
  });
  it("conserva el orden original y no cambia los datos de entrada", () => {
    const items = [
      { id: "caja", unitsPerPresentation: 60, closed: 2 },
      { id: "paquete", unitsPerPresentation: 12, closed: 0 },
    ];
    const result = normalizeClosed(110, items);
    expect(result.map((item) => item.id)).toEqual(["caja", "paquete"]);
    expect(items[0].closed).toBe(2);
  });
  it("con stock cero cierra todo", () => {
    expect(normalizeClosed(0, [caja(3)])[0].closed).toBe(0);
  });
});