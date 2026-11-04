import { describe, expect, it } from "vitest";
import { calculateRotatingAttendanceHours } from "./payroll";
import { DEFAULT_LABOR_LIMITS } from "./schedule-rules";

describe("calculateRotatingAttendanceHours", () => {
  it("pairs overnight punches and applies the 7-hour nocturnal daily cap", () => {
    const marks = [
      { type: "ENTRY", markedAt: new Date("2026-11-04T19:00:00-06:00") },
      { type: "LUNCH_START", markedAt: new Date("2026-11-04T23:00:00-06:00") },
      { type: "LUNCH_END", markedAt: new Date("2026-11-05T00:00:00-06:00") },
      { type: "EXIT", markedAt: new Date("2026-11-05T03:00:00-06:00") },
    ];
    const schedules = new Map([
      ["2026-11-04", { startTime: "19:00", legalClass: "NIGHT" as const }],
    ]);

    expect(
      calculateRotatingAttendanceHours(marks, schedules, 10, DEFAULT_LABOR_LIMITS),
    ).toMatchObject({
      ordinaryNightHours: 7,
      extraNightHours: 0,
      tardyMinutes: 0,
    });
  });

  it("turns nocturnal daily overage into extra hours", () => {
    const marks = [
      { type: "ENTRY", markedAt: new Date("2026-11-04T18:00:00-06:00") },
      { type: "LUNCH_START", markedAt: new Date("2026-11-04T22:00:00-06:00") },
      { type: "LUNCH_END", markedAt: new Date("2026-11-04T23:00:00-06:00") },
      { type: "EXIT", markedAt: new Date("2026-11-05T03:00:00-06:00") },
    ];
    const schedules = new Map([
      ["2026-11-04", { startTime: "18:00", legalClass: "NIGHT" as const }],
    ]);

    expect(
      calculateRotatingAttendanceHours(marks, schedules, 10, DEFAULT_LABOR_LIMITS),
    ).toMatchObject({
      ordinaryNightHours: 7,
      extraNightHours: 1,
    });
  });
});
