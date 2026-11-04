import { describe, expect, it } from "vitest";
import { calculateAttendanceHours, calculatePayroll } from "./payroll";

describe("calculateAttendanceHours", () => {
  it("subtracts a complete lunch break and calculates ordinary hours", () => {
    const hours = calculateAttendanceHours(
      [
        { type: "ENTRY", markedAt: new Date("2026-03-10T08:00:00-06:00") },
        { type: "LUNCH_START", markedAt: new Date("2026-03-10T12:00:00-06:00") },
        { type: "LUNCH_END", markedAt: new Date("2026-03-10T13:00:00-06:00") },
        { type: "EXIT", markedAt: new Date("2026-03-10T17:00:00-06:00") },
      ],
      "08:00",
      5,
    );

    expect(hours).toEqual({
      ordinaryDayHours: 8,
      ordinaryNightHours: 0,
      extraDayHours: 0,
      extraNightHours: 0,
      tardyMinutes: 0,
    });
  });

  it("applies the grace period to late arrivals", () => {
    const hours = calculateAttendanceHours(
      [
        { type: "ENTRY", markedAt: new Date("2026-03-10T09:10:00-06:00") },
        { type: "EXIT", markedAt: new Date("2026-03-10T17:10:00-06:00") },
      ],
      "09:00",
      5,
    );

    expect(hours.ordinaryDayHours).toBe(8);
    expect(hours.tardyMinutes).toBe(10);
  });
});

describe("calculatePayroll", () => {
  it("calculates statutory deductions and net pay", () => {
    const result = calculatePayroll(
      0,
      {
        ordinaryDayHours: 0,
        ordinaryNightHours: 0,
        extraDayHours: 0,
        extraNightHours: 0,
        tardyMinutes: 0,
      },
      100,
      0,
      true,
    );

    expect(result.grossPay).toBe(100);
    expect(result.isssDeduction).toBe(3);
    expect(result.afpDeduction).toBeCloseTo(7.25);
    expect(result.incomeTaxDeduction).toBe(0);
    expect(result.netPay).toBeCloseTo(89.75);
  });
});
