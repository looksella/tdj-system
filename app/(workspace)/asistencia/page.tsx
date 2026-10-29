import { AttendanceWorkspace } from "@/components/asistencia/attendance-workspace";
import { SinFicha } from "@/components/turno/sin-ficha";
import { isAllowed } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/lib/require-page-permission";
import { empleadoVinculado, rangoDelDia, valorLocal } from "@/lib/turno";

export const dynamic = "force-dynamic";

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
  const esEmpleado = user.role === "employee";
  const propio = await empleadoVinculado(user);
  if (esEmpleado && !propio) return <SinFicha que="tu asistencia" />;

  const { start, end } = rangoDelDia();
  const weekStart = new Date(start);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const [marksRaw, employees, settings] = await Promise.all([
    db.attendanceMark.findMany({
      where: { markedAt: { gte: weekStart, lte: end } },
      include: { employee: true },
      orderBy: { markedAt: "desc" },
      take: 100,
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true, scheduledStart: true, scheduledEnd: true },
    }),
    db.laborSettings.findFirst(),
  ]);

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
      employees={esEmpleado && propio
        ? employees.filter((employee) => employee.id === propio.id)
        : employees}
      graceMinutes={settings?.graceMinutes ?? 10}
      dayStart={start.toISOString()}
      dayEnd={end.toISOString()}
      canManage={isAllowed(user.role, "attendance:manage")}
      selfOnly={esEmpleado}
    />
  );
}
