import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rangoDelDia } from "@/lib/turno";
import { formatScheduleTime } from "@/lib/schedule-time";
import {
  DEFAULT_LABOR_LIMITS,
  isValidScheduleDate,
  patternShiftForDate,
  validateRoster,
  type LaborLimits,
  type RosterDay,
  type ShiftRule,
} from "@/lib/schedule-rules";

const DAY_MS = 86_400_000;
const asDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dayString = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
const shiftRule = (shift: {
  id: string;
  name: string;
  startTime: Date | string;
  endTime: Date | string;
  breakDurationMinutes: number;
}): ShiftRule & { id: string } => ({
  ...shift,
  startTime: formatScheduleTime(shift.startTime),
  endTime: formatScheduleTime(shift.endTime),
});

export type RosterOverrides = Record<string, string | null>;
export type EmployeeDailySchedule = {
  type: "FIXED" | "ROTATING";
  date: string;
  startTime: string | null;
  endTime: string | null;
  weeklyHours: number;
  shift: (ShiftRule & { id: string }) | null;
  isRestDay?: boolean;
};

async function laborLimits(tx: Prisma.TransactionClient): Promise<LaborLimits> {
  const settings = await tx.laborSettings.findFirst();
  return {
    dailyDayLimit: Number(settings?.dailyDayLimit ?? DEFAULT_LABOR_LIMITS.dailyDayLimit),
    weeklyDayLimit: Number(settings?.weeklyDayLimit ?? DEFAULT_LABOR_LIMITS.weeklyDayLimit),
    dailyNightLimit: Number(settings?.dailyNightLimit ?? DEFAULT_LABOR_LIMITS.dailyNightLimit),
    weeklyNightLimit: Number(settings?.weeklyNightLimit ?? DEFAULT_LABOR_LIMITS.weeklyNightLimit),
    minimumRestHours: settings?.minimumRestHours ?? DEFAULT_LABOR_LIMITS.minimumRestHours,
  };
}

export async function projectEmployeeRoster(
  tx: Prisma.TransactionClient,
  employeeId: string,
  patternId: string,
  anchorDate: string,
  requestedOverrides: RosterOverrides = {},
) {
  if (!isValidScheduleDate(anchorDate)) {
    throw new Error("Indica una fecha inicial válida para el patrón.");
  }
  const pattern = await tx.shiftPattern.findUnique({
    where: { id: patternId },
    include: { details: { include: { shift: true }, orderBy: { daySequence: "asc" } } },
  });
  if (
    !pattern ||
    pattern.details.length !== pattern.cycleDays ||
    pattern.details.some((detail, index) => detail.daySequence !== index + 1)
  ) {
    throw new Error("La plantilla seleccionada está incompleta o ya no existe.");
  }
  const availableShiftsRaw = await tx.shift.findMany({
    where: { isActive: true },
    select: { id: true, name: true, startTime: true, endTime: true, breakDurationMinutes: true },
  });
  const availableShifts = availableShiftsRaw.map(shiftRule);
  const shiftMap = new Map(availableShifts.map((shift) => [shift.id, shift]));
  const detailRules = pattern.details.map((detail) => {
    if (!detail.isRestDay && (!detail.shiftId || !shiftMap.has(detail.shiftId))) {
      throw new Error("La plantilla usa una franja horaria inactiva.");
    }
    return {
      daySequence: detail.daySequence,
      shiftId: detail.shiftId,
      isRestDay: detail.isRestDay,
    };
  });
  const validationStart = rangoDelDia().day;
  const validationDays = Array.from({ length: 37 }, (_, index) => addDays(validationStart, index));
  const projectionStart = asDay(validationStart);
  const projectionEnd = asDay(addDays(validationStart, 30));
  const existingOverrides = await tx.employeeRoster.findMany({
    where: {
      employeeId,
      date: { gte: projectionStart, lt: asDay(addDays(validationStart, 37)) },
      isOverride: true,
    },
    select: { date: true, shiftId: true },
  });
  const overrides = new Map(
    existingOverrides.map((entry) => [dayString(entry.date), entry.shiftId]),
  );
  for (const [date, shiftId] of Object.entries(requestedOverrides)) {
    if (
      !isValidScheduleDate(date) ||
      !validationDays.includes(date) ||
      date < validationStart ||
      date >= addDays(validationStart, 30)
    ) {
      throw new Error("Los ajustes manuales deben estar dentro de los próximos 30 días.");
    }
    if (shiftId !== null && !shiftMap.has(shiftId)) {
      throw new Error("Uno de los turnos ajustados ya no está disponible.");
    }
    overrides.set(date, shiftId);
  }
  const roster: RosterDay[] = validationDays.map((date) => ({
    date,
    shiftId: overrides.has(date)
      ? (overrides.get(date) ?? null)
      : patternShiftForDate(date, anchorDate, pattern.cycleDays, detailRules),
  }));
  const validation = validateRoster(roster, availableShifts.map(shiftRule), await laborLimits(tx));
  await tx.employeeRoster.deleteMany({
    where: { employeeId, date: { gte: projectionStart, lt: projectionEnd }, isOverride: false },
  });
  const projection: RosterDay[] = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(validationStart, index);
    return { date, shiftId: roster[index].shiftId };
  });
  const overridesInProjection = new Set(
    existingOverrides
      .filter((entry) => entry.date >= projectionStart && entry.date < projectionEnd)
      .map((entry) => dayString(entry.date)),
  );
  const defaults = projection.filter((entry) => !overridesInProjection.has(entry.date));
  if (defaults.length) {
    await tx.employeeRoster.createMany({
      data: defaults.map((entry) => ({
        employeeId,
        date: asDay(entry.date),
        shiftId: entry.shiftId,
        isOverride: false,
      })),
      skipDuplicates: true,
    });
  }
  for (const [date, shiftId] of Object.entries(requestedOverrides)) {
    if (
      date < validationStart ||
      date >= addDays(validationStart, 30) ||
      !validationDays.includes(date)
    )
      continue;
    await tx.employeeRoster.upsert({
      where: { employeeId_date: { employeeId, date: asDay(date) } },
      create: { employeeId, date: asDay(date), shiftId, isOverride: true },
      update: { shiftId, isOverride: true },
    });
  }
  const averageWindow = projection.slice(0, 28);
  const averageWeeklyHours =
    ((averageWindow.reduce((total, entry) => {
      if (!entry.shiftId) return total;
      const shift = shiftMap.get(entry.shiftId);
      if (!shift) return total;
      const [startHour, startMinute] = shift.startTime.split(":").map(Number);
      const [endHour, endMinute] = shift.endTime.split(":").map(Number);
      let grossMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
      if (grossMinutes <= 0) grossMinutes += 1440;
      return total + grossMinutes - shift.breakDurationMinutes;
    }, 0) /
      averageWindow.length) *
      7) /
    60;
  return { ...validation, averageWeeklyHours, projectedDays: projection.length };
}

export async function clearFutureEmployeeRoster(tx: Prisma.TransactionClient, employeeId: string) {
  const today = asDay(rangoDelDia().day);
  await tx.employeeRoster.deleteMany({ where: { employeeId, date: { gte: today } } });
}

export async function getEmployeeDailySchedule(employeeId: string, date: string) {
  const schedules = await getEmployeeDailySchedules([employeeId], date, date);
  return schedules.get(employeeId)?.get(date) ?? null;
}

export async function getEmployeeDailySchedules(
  employeeIds: string[],
  startDate: string,
  endDate: string,
) {
  if (!isValidScheduleDate(startDate) || !isValidScheduleDate(endDate) || startDate > endDate) {
    throw new Error("El rango de fechas consultado no es válido.");
  }
  const employees = await db.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      scheduleType: true,
      scheduledStart: true,
      scheduledEnd: true,
      weeklyHours: true,
      schedulePatternId: true,
      scheduleAnchorDate: true,
      schedulePattern: {
        include: { details: { include: { shift: true }, orderBy: { daySequence: "asc" } } },
      },
    },
  });
  if (employees.length !== new Set(employeeIds).size) {
    throw new Error("No se encontró una o más fichas del equipo.");
  }
  const rosters = await db.employeeRoster.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: asDay(startDate), lt: asDay(addDays(endDate, 1)) },
    },
    include: { shift: true },
  });
  const rosterByKey = new Map(
    rosters.map((entry) => [
      `${entry.employeeId}:${dayString(entry.date)}`,
      { ...entry, shift: entry.shift ? shiftRule(entry.shift) : null },
    ]),
  );
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date);
  const result = new Map<string, Map<string, EmployeeDailySchedule>>();
  for (const employee of employees) {
    const employeeSchedules = new Map<string, EmployeeDailySchedule>();
    for (const date of dates) {
      if (employee.scheduleType !== "ROTATING") {
        employeeSchedules.set(date, {
          type: "FIXED" as const,
          date,
          startTime: employee.scheduledStart,
          endTime: employee.scheduledEnd,
          weeklyHours: Number(employee.weeklyHours),
          shift: null,
        });
        continue;
      }
      const assigned = rosterByKey.get(`${employee.id}:${date}`);
      let shift = assigned?.shift ?? null;
      let isRestDay = assigned ? assigned.shiftId === null : false;
      if (!assigned) {
        if (!employee.schedulePattern || !employee.scheduleAnchorDate) {
          throw new Error(
            "A la persona le falta la plantilla o fecha inicial de su jornada rotativa.",
          );
        }
        const shiftId = patternShiftForDate(
          date,
          dayString(employee.scheduleAnchorDate),
          employee.schedulePattern.cycleDays,
          employee.schedulePattern.details,
        );
        const patternShift = employee.schedulePattern.details.find(
          (detail) => detail.shiftId === shiftId,
        )?.shift;
        shift = patternShift ? shiftRule(patternShift) : null;
        isRestDay = !shiftId;
      }
      employeeSchedules.set(date, {
        type: "ROTATING" as const,
        date,
        startTime: shift?.startTime ?? null,
        endTime: shift?.endTime ?? null,
        weeklyHours: Number(employee.weeklyHours),
        shift,
        isRestDay,
      });
    }
    result.set(employee.id, employeeSchedules);
  }
  return result;
}
