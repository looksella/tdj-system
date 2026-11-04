export type ShiftRule = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
};

export type RosterDay = {
  date: string;
  shiftId: string | null;
};

export type LaborLimits = {
  dailyDayLimit: number;
  weeklyDayLimit: number;
  dailyNightLimit: number;
  weeklyNightLimit: number;
  minimumRestHours: number;
};

export const DEFAULT_LABOR_LIMITS: LaborLimits = {
  dailyDayLimit: 8,
  weeklyDayLimit: 44,
  dailyNightLimit: 7,
  weeklyNightLimit: 39,
  minimumRestHours: 8,
};

export function isValidScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function minuteOfDay(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function shiftMetrics(shift: ShiftRule, limits: LaborLimits = DEFAULT_LABOR_LIMITS) {
  const start = minuteOfDay(shift.startTime);
  const endTime = minuteOfDay(shift.endTime);
  const end = endTime <= start ? endTime + 1440 : endTime;
  const durationMinutes = end - start;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(endTime) ||
    start < 0 ||
    start >= 1440 ||
    endTime < 0 ||
    endTime >= 1440 ||
    durationMinutes <= 0 ||
    durationMinutes > 16 * 60 ||
    !Number.isInteger(shift.breakDurationMinutes) ||
    shift.breakDurationMinutes < 0 ||
    shift.breakDurationMinutes >= durationMinutes
  ) {
    throw new Error(`El turno “${shift.name}” tiene horas o descanso inválidos.`);
  }
  let nightMinutes = 0;
  for (let day = 0; day <= 1; day += 1) {
    for (const [nightStart, nightEnd] of [
      [day * 1440, day * 1440 + 360],
      [day * 1440 + 1140, day * 1440 + 1440],
    ]) {
      nightMinutes += Math.max(0, Math.min(end, nightEnd) - Math.max(start, nightStart));
    }
  }
  const netMinutes = durationMinutes - shift.breakDurationMinutes;
  const isNight = nightMinutes > 4 * 60;
  return {
    durationMinutes,
    netMinutes,
    nightMinutes,
    legalClass: isNight ? ("NIGHT" as const) : ("DAY" as const),
    dailyLimit: isNight ? limits.dailyNightLimit : limits.dailyDayLimit,
    estimatedHours: netMinutes / 60,
  };
}

export function patternShiftForDate(
  date: string,
  anchorDate: string,
  cycleDays: number,
  details: { daySequence: number; shiftId: string | null; isRestDay: boolean }[],
) {
  const dateNumber = Date.parse(`${date}T00:00:00Z`);
  const anchorNumber = Date.parse(`${anchorDate}T00:00:00Z`);
  if (
    !isValidScheduleDate(date) ||
    !isValidScheduleDate(anchorDate) ||
    !Number.isFinite(dateNumber) ||
    !Number.isFinite(anchorNumber) ||
    !Number.isInteger(cycleDays) ||
    cycleDays < 1
  ) {
    throw new Error("La fecha de inicio o el ciclo del patrón no son válidos.");
  }
  const index =
    ((Math.round((dateNumber - anchorNumber) / 86_400_000) % cycleDays) + cycleDays) % cycleDays;
  const detail = details.find((entry) => entry.daySequence === index + 1);
  if (!detail)
    throw new Error("La plantilla no tiene un día definido para cada posición del ciclo.");
  return detail.isRestDay ? null : detail.shiftId;
}

export function validateRoster(
  roster: RosterDay[],
  shifts: ShiftRule[],
  limits: LaborLimits = DEFAULT_LABOR_LIMITS,
) {
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const seenDates = new Set<string>();
  const work = roster
    .map((day) => {
      if (!isValidScheduleDate(day.date)) throw new Error("Una fecha del calendario no es válida.");
      if (seenDates.has(day.date)) throw new Error(`Hay más de una asignación para ${day.date}.`);
      seenDates.add(day.date);
      if (!day.shiftId) return null;
      const shift = shiftById.get(day.shiftId);
      if (!shift) throw new Error("Uno de los turnos seleccionados ya no está disponible.");
      const metrics = shiftMetrics(shift, limits);
      if (metrics.estimatedHours > metrics.dailyLimit) {
        throw new Error(
          `${shift.name} excede el máximo diario de ${metrics.dailyLimit} horas para jornada ${metrics.legalClass === "NIGHT" ? "nocturna" : "diurna"}.`,
        );
      }
      const [year, month, date] = day.date.split("-").map(Number);
      const start = Date.UTC(
        year,
        month - 1,
        date,
        Math.floor(minuteOfDay(shift.startTime) / 60),
        minuteOfDay(shift.startTime) % 60,
      );
      const end = start + metrics.durationMinutes * 60_000;
      return {
        date: day.date,
        start,
        end,
        minutes: metrics.netMinutes,
        legalClass: metrics.legalClass,
        name: shift.name,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.start - b.start);

  for (let index = 1; index < work.length; index += 1) {
    const restMinutes = (work[index].start - work[index - 1].end) / 60_000;
    if (restMinutes < limits.minimumRestHours * 60) {
      throw new Error(
        `Entre ${work[index - 1].name} y ${work[index].name} hay ${Math.max(0, restMinutes / 60).toFixed(1)} horas de descanso; se requieren ${limits.minimumRestHours}.`,
      );
    }
  }

  const hoursByDate = new Map(
    work.map((entry) => [entry.date, { day: 0, night: 0, hours: entry.minutes / 60 }]),
  );
  for (const entry of work) {
    if (entry.legalClass === "NIGHT") hoursByDate.get(entry.date)!.night += entry.minutes / 60;
    else hoursByDate.get(entry.date)!.day += entry.minutes / 60;
  }
  for (const date of [...seenDates].sort()) {
    const start = Date.parse(`${date}T00:00:00Z`);
    const week = Array.from({ length: 7 }, (_, index) => {
      const key = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
      return hoursByDate.get(key) ?? { day: 0, night: 0, hours: 0 };
    });
    const dayHours = week.reduce((sum, item) => sum + item.day, 0);
    const nightHours = week.reduce((sum, item) => sum + item.night, 0);
    const total = dayHours + nightHours;
    const isPredominantlyNight = nightHours > 0 && nightHours >= dayHours;
    const limit = isPredominantlyNight ? limits.weeklyNightLimit : limits.weeklyDayLimit;
    if (total > limit + 1e-8) {
      throw new Error(
        `El ciclo supera ${limit} horas en una ventana de 7 días (${total.toFixed(1)} horas; límite ${isPredominantlyNight ? "nocturno" : "diurno"}).`,
      );
    }
  }
  return {
    averageWeeklyHours:
      ((work.reduce((sum, entry) => sum + entry.minutes, 0) / Math.max(1, seenDates.size)) * 7) /
      60,
  };
}
