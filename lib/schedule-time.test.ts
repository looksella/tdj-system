import { describe, expect, it } from "vitest";
import { formatScheduleTime, scheduleTimeDate } from "./schedule-time";

describe("schedule TIME conversion", () => {
  it("round-trips PostgreSQL TIME values through Prisma DateTime", () => {
    expect(formatScheduleTime(scheduleTimeDate("03:05"))).toBe("03:05");
  });

  it("rejects malformed or out-of-range times", () => {
    expect(() => scheduleTimeDate("24:00")).toThrow(/hora del turno no es válida/);
    expect(() => scheduleTimeDate("8:00")).toThrow(/hora del turno no es válida/);
  });
});
