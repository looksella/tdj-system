import { describe, expect, it } from "vitest";
import { cashMethodFromSale, cents } from "./caja";

describe("cashMethodFromSale", () => {
  it.each([
    ["Efectivo", "CASH"],
    ["Tarjeta", "CARD"],
    ["Transferencia", "TRANSFER"],
    ["Crédito", "CREDIT"],
    ["Otro", "OTHER"],
    ["Desconocido", "OTHER"],
  ])("maps %s to %s", (method, expected) => {
    expect(cashMethodFromSale(method)).toBe(expected);
  });
});

describe("cents", () => {
  it("rounds currency to the nearest cent", () => {
    expect(cents(12.345)).toBe(1235);
    expect(cents(12.344)).toBe(1234);
  });
});
