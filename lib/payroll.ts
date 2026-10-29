import { TIMEZONE } from "@/lib/locale";
export type PayrollHours = {
  ordinaryDayHours: number;
  ordinaryNightHours: number;
  extraDayHours: number;
  extraNightHours: number;
  tardyMinutes: number;
};
type Workday = { day: number; night: number; tardy: number; regularDay: number; regularNight: number; extraDay: number; extraNight: number };
const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "2-digit", hourCycle: "h23" });
const minuteFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
function isNight(date: Date) {
  const hour = Number(hourFormatter.format(date));
  return hour >= 19 || hour < 6;
}
function localDay(date: Date) {
  return localDayFormatter.format(date);
}
function weekKey(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((dayOfWeek + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function calculateAttendanceHours(
  marks: { type: string; markedAt: Date }[],
  scheduledStart: string,
  graceMinutes: number,
): PayrollHours {
  const sorted = [...marks].sort((a, b) => a.markedAt.getTime() - b.markedAt.getTime());
  const byDay = new Map<string, Workday>();
  for (const entry of sorted.filter((mark) => mark.type === "ENTRY")) {
    const day = localDay(entry.markedAt);
    const group = sorted.filter((mark) => localDay(mark.markedAt) === day);
    const lunchStart = group.find((mark) => mark.type === "LUNCH_START" && mark.markedAt > entry.markedAt);
    const lunchEnd = group.find((mark) => mark.type === "LUNCH_END" && mark.markedAt > (lunchStart?.markedAt ?? entry.markedAt));
    const exit = group.find((mark) => mark.type === "EXIT" && mark.markedAt > (lunchEnd?.markedAt ?? lunchStart?.markedAt ?? entry.markedAt));
    if (!exit) continue;
    const actual = minuteFormatter.formatToParts(entry.markedAt);
    const actualMinutes = Number(actual.find((part) => part.type === "hour")?.value) * 60 + Number(actual.find((part) => part.type === "minute")?.value);
    const expectedMinutes = Number(scheduledStart.slice(0, 2)) * 60 + Number(scheduledStart.slice(3, 5));
    const tardy = actualMinutes > expectedMinutes + graceMinutes ? actualMinutes - expectedMinutes : 0;
    const workday = byDay.get(day) ?? { day: 0, night: 0, tardy: 0, regularDay: 0, regularNight: 0, extraDay: 0, extraNight: 0 };
    workday.tardy = Math.max(workday.tardy, tardy);
    const intervals = lunchStart && lunchEnd
      ? [[entry.markedAt, lunchStart.markedAt], [lunchEnd.markedAt, exit.markedAt]]
      : [[entry.markedAt, exit.markedAt]];
    for (const [from, to] of intervals) {
      for (let instant = from.getTime(); instant < to.getTime(); instant += 60000) {
        if (isNight(new Date(instant))) workday.night += 1;
        else workday.day += 1;
      }
    }
    byDay.set(day, workday);
  }
  for (const workday of byDay.values()) {
    workday.regularDay = Math.min(workday.day, 8 * 60);
    workday.regularNight = Math.min(workday.night, 7 * 60);
    workday.extraDay = workday.day - workday.regularDay;
    workday.extraNight = workday.night - workday.regularNight;
  }
  const weeks = new Map<string, [string, Workday][]>();
  for (const [day, workday] of byDay) {
    const key = weekKey(day);
    weeks.set(key, [...(weeks.get(key) ?? []), [day, workday]]);
  }
  for (const days of weeks.values()) {
    const totalRegularDay = days.reduce((sum, [, day]) => sum + day.regularDay, 0);
    let dayOverage = Math.max(0, totalRegularDay - 44 * 60);
    for (const [, day] of [...days].sort((a, b) => b[0].localeCompare(a[0]))) {
      const moved = Math.min(day.regularDay, dayOverage);
      day.regularDay -= moved;
      day.extraDay += moved;
      dayOverage -= moved;
    }
    const totalRegularNight = days.reduce((sum, [, day]) => sum + day.regularNight, 0);
    let nightOverage = Math.max(0, totalRegularNight - 39 * 60);
    for (const [, day] of [...days].sort((a, b) => b[0].localeCompare(a[0]))) {
      const moved = Math.min(day.regularNight, nightOverage);
      day.regularNight -= moved;
      day.extraNight += moved;
      nightOverage -= moved;
    }
  }
  return {
    ordinaryDayHours: [...byDay.values()].reduce((sum, day) => sum + day.regularDay, 0) / 60,
    ordinaryNightHours: [...byDay.values()].reduce((sum, day) => sum + day.regularNight, 0) / 60,
    extraDayHours: [...byDay.values()].reduce((sum, day) => sum + day.extraDay, 0) / 60,
    extraNightHours: [...byDay.values()].reduce((sum, day) => sum + day.extraNight, 0) / 60,
    tardyMinutes: [...byDay.values()].reduce((sum, day) => sum + day.tardy, 0),
  };
}
export function calculatePayroll(
  salary: number,
  hours: PayrollHours,
  bonus: number,
  adjustment: number,
  deductionsEnabled: boolean,
  holidayHours = 0,
  weeklyHours = 44,
) {
  const hourly = salary / 30 / 8;
  const ordinaryHours = hours.ordinaryDayHours + hours.ordinaryNightHours;
  const expectedMonthlyHours = weeklyHours * 52 / 12;
  const salaryPortion = salary * Math.min(1, ordinaryHours / expectedMonthlyHours);
  const nightPremium = hours.ordinaryNightHours * hourly * 0.25;
  const basePay = salaryPortion + nightPremium;
  const overtimePay = hours.extraDayHours * hourly * 2 + hours.extraNightHours * hourly * 2.5;
  const holidayPay = holidayHours * hourly * 2;
  const grossPay = Math.max(0, basePay + overtimePay + holidayPay + bonus + adjustment);
  const isssDeduction = deductionsEnabled ? Math.min(grossPay, 1000) * 0.03 : 0;
  const afpDeduction = deductionsEnabled ? grossPay * 0.0725 : 0;
  const taxable = Math.max(0, grossPay - isssDeduction - afpDeduction);
  const incomeTaxDeduction = deductionsEnabled
    ? taxable <= 550 ? 0
      : taxable <= 895.24 ? (taxable - 550) * 0.1 + 17.67
        : taxable <= 2038.1 ? (taxable - 895.24) * 0.2 + 60
          : (taxable - 2038.1) * 0.3 + 288.57
    : 0;
  return {
    hourly, expectedMonthlyHours, basePay, overtimePay, holidayPay, grossPay, isssDeduction, afpDeduction,
    incomeTaxDeduction, netPay: grossPay - isssDeduction - afpDeduction - incomeTaxDeduction,
  };
}
