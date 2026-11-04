import { describe, expect, it } from "vitest";
import { rangoDelDia } from "./turno";

describe("rangoDelDia", () => {
  it("uses the business timezone and an exclusive next-day boundary", () => {
    const { day, start, end } = rangoDelDia(new Date("2026-11-04T15:00:00Z"));

    expect(day).toBe("2026-11-04");
    expect(start.toISOString()).toBe("2026-11-04T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-05T06:00:00.000Z");
  });
});
