import { describe, expect, it } from "vitest";
import { discountedLineCents, dollarsToCents } from "./pricing";

describe("descuentos por monto", () => {
  it("sin descuento deja el subtotal igual", () => {
    expect(discountedLineCents(250, 3).totalCents).toBe(750);
  });
  it("resta el descuento de la línea", () => {
    expect(discountedLineCents(250, 3, 50).totalCents).toBe(700);
  });
  it("permite dejar la línea en cero", () => {
    expect(discountedLineCents(250, 1, 250).totalCents).toBe(0);
  });
  it("rechaza un descuento mayor al subtotal", () => {
    expect(() => discountedLineCents(250, 1, 251)).toThrow();
  });
  it("rechaza negativos y decimales", () => {
    expect(() => discountedLineCents(250, 1, -1)).toThrow();
    expect(() => discountedLineCents(250, 1, 1.5)).toThrow();
  });
  it("convierte dólares a centavos", () => {
    expect(dollarsToCents("1.5")).toBe(150);
    expect(dollarsToCents("0.50")).toBe(50);
    expect(dollarsToCents("1.505")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("")).toBeNull();
  });
});