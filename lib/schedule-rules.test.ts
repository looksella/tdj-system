import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABOR_LIMITS,
  patternShiftForDate,
  shiftMetrics,
  validateRoster,
} from "./schedule-rules";

const dayShift = {
  id: "day",
  name: "Diurno",
  startTime: "08:00",
  endTime: "17:00",
  breakDurationMinutes: 60,
};
const nightShift = {
  id: "night",
  name: "Nocturno",
  startTime: "19:00",
  endTime: "03:00",
  breakDurationMinutes: 60,
};

describe("shiftMetrics", () => {
  it("uses net hours and classifies a shift with over four night hours as nocturnal", () => {
    expect(shiftMetrics(dayShift)).toMatchObject({
      netMinutes: 480,
      legalClass: "DAY",
      dailyLimit: 8,
    });
    expect(shiftMetrics(nightShift)).toMatchObject({
      netMinutes: 420,
      legalClass: "NIGHT",
      dailyLimit: 7,
    });
  });

  it("uses configured daily limits and validates real calendar dates", () => {
    expect(shiftMetrics(dayShift, { ...DEFAULT_LABOR_LIMITS, dailyDayLimit: 7 }).dailyLimit).toBe(
      7,
    );
    expect(() => patternShiftForDate("2026-02-31", "2026-02-01", 7, [])).toThrow(
      /fecha de inicio o el ciclo/,
    );
  });
});

describe("patternShiftForDate", () => {
  const details = [
    { daySequence: 1, shiftId: "day", isRestDay: false },
    { daySequence: 2, shiftId: null, isRestDay: true },
  ];

  it("projects both forward and backward from the selected cycle start", () => {
    expect(patternShiftForDate("2026-11-05", "2026-11-04", 2, details)).toBeNull();
    expect(patternShiftForDate("2026-11-03", "2026-11-04", 2, details)).toBeNull();
  });
});

describe("validateRoster", () => {
  it("rejects a seven-day nocturnal window above 39 net hours", () => {
    const roster = Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10),
      shiftId: "night",
    }));

    expect(() => validateRoster(roster, [nightShift])).toThrow(/39 horas/);
  });

  it("accepts five daytime shifts within the 44-hour window", () => {
    const roster = Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10),
      shiftId: index < 5 ? "day" : null,
    }));

    expect(validateRoster(roster, [dayShift], DEFAULT_LABOR_LIMITS).averageWeeklyHours).toBeCloseTo(
      40,
    );
  });

  it("rejects less than eight uninterrupted hours between shifts", () => {
    const roster = [
      { date: "2026-11-04", shiftId: "late" },
      { date: "2026-11-05", shiftId: "early" },
    ];
    const shifts = [
      {
        id: "late",
        name: "Tarde",
        startTime: "17:00",
        endTime: "23:00",
        breakDurationMinutes: 0,
      },
      {
        id: "early",
        name: "Mañana",
        startTime: "05:00",
        endTime: "11:00",
        breakDurationMinutes: 0,
      },
    ];

    expect(() => validateRoster(roster, shifts)).toThrow(/se requieren 8/);
  });

  it("rejects two roster assignments for the same date", () => {
    expect(() =>
      validateRoster(
        [
          { date: "2026-11-04", shiftId: "day" },
          { date: "2026-11-04", shiftId: "night" },
        ],
        [dayShift, nightShift],
      ),
    ).toThrow(/más de una asignación/);
  });
});
