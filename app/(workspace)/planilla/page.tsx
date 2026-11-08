import { PayrollWorkspace } from "@/components/planilla/payroll-workspace";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/features/resolve";
import { requirePagePermission } from "@/lib/require-page-permission";
import { mesActual, rangoDelDia } from "@/lib/turno";
import { formatScheduleTime } from "@/lib/schedule-time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planilla" };

/**
 * Planilla del mes: cálculo de horas desde los marcajes, deducciones de ley
 * (ISSS, AFP y renta) y gestión del equipo.
 *
 * Solo `payroll:manage`, o sea administrador: acá se ven salarios, descuentos
 * y el neto de cada persona, además de crear fichas y PIN.
 */
export default async function PlanillaPage() {
  await requirePagePermission("payroll:manage");
  await requireFeature("payroll");

  const { day } = rangoDelDia();
  const rosterEnd = new Date(`${day}T00:00:00.000Z`);
  rosterEnd.setUTCDate(rosterEnd.getUTCDate() + 30);
  const [employeesRaw, linesRaw, patterns, shifts] = await Promise.all([
    db.employee.findMany({
      orderBy: [{ active: "desc" }, { fullName: "asc" }],
      take: 50,
      include: {
        rosters: {
          where: { date: { gte: new Date(`${day}T00:00:00.000Z`), lt: rosterEnd } },
          include: { shift: true },
          orderBy: { date: "asc" },
        },
      },
    }),
    db.payrollLine.findMany({
      include: { employee: true },
      orderBy: { periodEnd: "desc" },
      take: 40,
    }),
    db.shiftPattern.findMany({
      orderBy: { cycleDays: "asc" },
      include: { details: { include: { shift: true }, orderBy: { daySequence: "asc" } } },
    }),
    db.shift.findMany({
      where: { isActive: true },
      orderBy: { startTime: "asc" },
      select: { id: true, name: true, startTime: true, endTime: true, breakDurationMinutes: true },
    }),
  ]);

  const employees = employeesRaw.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    email: employee.email,
    role: employee.role,
    monthlySalary: Number(employee.monthlySalary),
    applyLegalDeductions: employee.applyLegalDeductions,
    scheduledStart: employee.scheduledStart,
    scheduledEnd: employee.scheduledEnd,
    weeklyHours: Number(employee.weeklyHours),
    scheduleType: employee.scheduleType,
    schedulePatternId: employee.schedulePatternId,
    scheduleAnchorDate: employee.scheduleAnchorDate?.toISOString().slice(0, 10) ?? null,
    rosters: employee.rosters.map((entry) => ({
      date: entry.date.toISOString().slice(0, 10),
      shiftId: entry.shiftId,
      isOverride: entry.isOverride,
    })),
    active: employee.active,
  }));

  const lines = linesRaw.map((line) => ({
    id: line.id,
    employeeId: line.employeeId,
    employeeName: line.employee.fullName,
    employeeRole: line.employee.role,
    monthlySalary: Number(line.employee.monthlySalary),
    weeklyHours: Number(line.employee.weeklyHours),
    periodStart: line.periodStart.toISOString(),
    periodEnd: line.periodEnd.toISOString(),
    ordinaryDayHours: Number(line.ordinaryDayHours),
    ordinaryNightHours: Number(line.ordinaryNightHours),
    extraDayHours: Number(line.extraDayHours),
    extraNightHours: Number(line.extraNightHours),
    holidayHours: Number(line.holidayHours),
    compensatoryDayOff: line.compensatoryDayOff,
    tardyMinutes: line.tardyMinutes,
    basePay: Number(line.basePay),
    overtimePay: Number(line.overtimePay),
    bonuses: Number(line.bonuses),
    adjustments: Number(line.adjustments),
    grossPay: Number(line.grossPay),
    isssDeduction: Number(line.isssDeduction),
    afpDeduction: Number(line.afpDeduction),
    incomeTaxDeduction: Number(line.incomeTaxDeduction),
    netPay: Number(line.netPay),
    legalDeductions: line.legalDeductions,
    status: line.status,
  }));

  const shiftOptions = shifts.map((shift) => ({
    ...shift,
    startTime: formatScheduleTime(shift.startTime),
    endTime: formatScheduleTime(shift.endTime),
  }));
  const patternOptions = patterns.map((pattern) => ({
    id: pattern.id,
    name: pattern.name,
    cycleDays: pattern.cycleDays,
    details: pattern.details.map((detail) => ({
      daySequence: detail.daySequence,
      shiftId: detail.shiftId,
      isRestDay: detail.isRestDay,
    })),
  }));
  return (
    <PayrollWorkspace
      employees={employees}
      lines={lines}
      month={mesActual()}
      patterns={patternOptions}
      shifts={shiftOptions}
      scheduleStartDate={day}
    />
  );
}
