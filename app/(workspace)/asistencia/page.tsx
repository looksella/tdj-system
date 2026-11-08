import { AttendanceWorkspace } from "@/components/asistencia/attendance-workspace";
import { SinFicha } from "@/components/turno/sin-ficha";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/features/resolve";
import { getEffectivePermissions, hasPermission } from "@/lib/permissions/resolve";
import { requirePagePermission } from "@/lib/require-page-permission";
import { getEmployeeDailySchedules } from "@/lib/employee-schedule-service";
import { empleadoVinculado, rangoDelDia, valorLocal } from "@/lib/turno";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asistencia" };

/**
 * Asistencia: marcaje por PIN, tablero del día y registro de la semana.
 *
 * `attendance:punch` deja marcar; `attendance:manage` (solo administrador)
 * habilita corregir o borrar marcajes y cambiar la tolerancia. La fecha de
 * edición se muestra en el formato de `<input type="datetime-local">`, que es
 * el que usa el formulario.
 */
export default async function AsistenciaPage() {
  const user = await requirePagePermission("attendance:punch");
  await requireFeature("attendance");
  const permissions = await getEffectivePermissions(user);
  const esEmpleado = user.role === "employee";
  const propio = await empleadoVinculado(user);
  if (esEmpleado && !propio) return <SinFicha que="tu asistencia" />;

  const { day, start, end } = rangoDelDia();
  const weekStart = new Date(start);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const [marksRaw, employees, settings] = await Promise.all([
    db.attendanceMark.findMany({
      where: { markedAt: { gte: weekStart, lt: end } },
      include: { employee: true },
      orderBy: { markedAt: "desc" },
      take: 100,
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        role: true,
        scheduledStart: true,
        scheduledEnd: true,
        scheduleType: true,
      },
    }),
    db.laborSettings.findFirst(),
  ]);
  const dailySchedules = await getEmployeeDailySchedules(
    employees.map((employee) => employee.id),
    day,
    day,
  );

  const marks = marksRaw.map((mark) => ({
    id: mark.id,
    employeeId: mark.employeeId,
    employeeName: mark.employee.fullName,
    role: mark.employee.role,
    type: mark.type,
    markedAt: mark.markedAt.toISOString(),
    localInput: valorLocal(mark.markedAt),
  }));

  return (
    <AttendanceWorkspace
      marks={marks}
      employees={(esEmpleado && propio
        ? employees.filter((employee) => employee.id === propio.id)
        : employees
      ).map((employee) => {
        const schedule = dailySchedules.get(employee.id)?.get(day);
        return {
          id: employee.id,
          fullName: employee.fullName,
          role: employee.role,
          scheduledStart: employee.scheduledStart,
          scheduledEnd: employee.scheduledEnd,
          scheduleType: employee.scheduleType,
          todayShiftName:
            schedule?.type === "ROTATING" ? (schedule.shift?.name ?? "Descanso") : null,
          todayStart: schedule?.startTime?.slice(0, 5) ?? employee.scheduledStart,
          todayEnd: schedule?.endTime?.slice(0, 5) ?? employee.scheduledEnd,
          todayIsRest: schedule?.type === "ROTATING" && schedule.isRestDay === true,
        };
      })}
      graceMinutes={settings?.graceMinutes ?? 10}
      weekStartsOn={settings?.weekStartsOn ?? 1}
      dayStart={start.toISOString()}
      dayEnd={end.toISOString()}
      canManage={hasPermission(permissions, "attendance:manage")}
      selfOnly={esEmpleado}
    />
  );
}
