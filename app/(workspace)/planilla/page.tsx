import { PayrollWorkspace } from "@/components/planilla/payroll-workspace";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/lib/require-page-permission";
import { mesActual } from "@/lib/turno";

export const dynamic = "force-dynamic";

/**
 * Planilla del mes: cálculo de horas desde los marcajes, deducciones de ley
 * (ISSS, AFP y renta) y gestión del equipo.
 *
 * Solo `payroll:manage`, o sea administrador: acá se ven salarios, descuentos
 * y el neto de cada persona, además de crear fichas y PIN.
 */
export default async function PlanillaPage() {
  await requirePagePermission("payroll:manage");

  const [employeesRaw, linesRaw] = await Promise.all([
    db.employee.findMany({ orderBy: [{ active: "desc" }, { fullName: "asc" }], take: 50 }),
    db.payrollLine.findMany({ include: { employee: true }, orderBy: { periodEnd: "desc" }, take: 40 }),
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

  return <PayrollWorkspace employees={employees} lines={lines} month={mesActual()} />;
}
