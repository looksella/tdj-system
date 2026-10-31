import { CashWorkspace } from "@/components/caja/cash-workspace";
import { SinFicha } from "@/components/turno/sin-ficha";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/lib/require-page-permission";
import { empleadoVinculado } from "@/lib/turno";

export const dynamic = "force-dynamic";

/**
 * Caja del turno: apertura, movimientos, cierre, arqueo y reporte PDF.
 *
 * Accesible con `cash:operate` (empleado y administrador). Un empleado opera
 * solo su propio turno: la nómina de cajas cerradas y el botón de cerrar la
 * caja de otra persona no se le muestran, y el servidor vuelve a verificar en
 * `lib/actions/operations.ts`.
 */
export default async function CajaPage() {
  const user = await requirePagePermission("cash:operate");
  const esEmpleado = user.role === "employee";
  const propio = await empleadoVinculado(user);
  if (esEmpleado && !propio) return <SinFicha que="la caja" />;

  const [sessionsRaw, employeesRaw] = await Promise.all([
    db.cashSession.findMany({
      include: { employee: true, movements: { orderBy: { occurredAt: "desc" } } },
      orderBy: { openedAt: "desc" },
      take: 100,
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  const sessions = sessionsRaw.map((session) => ({
    id: session.id,
    employeeId: session.employeeId,
    employeeName: session.employee.fullName,
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    openingFloat: Number(session.openingFloat),
    countedCash: session.countedCash === null ? null : Number(session.countedCash),
    expectedCash: session.expectedCash === null ? null : Number(session.expectedCash),
    difference: session.difference === null ? null : Number(session.difference),
    notes: session.notes,
    annulledAt: session.annulledAt?.toISOString() ?? null,
    annulmentReason: session.annulmentReason,
    movements: session.movements.map((move) => ({
      id: move.id,
      saleId: move.saleId,
      type: move.type,
      method: move.method,
      amount: Number(move.amount),
      description: move.description,
      occurredAt: move.occurredAt.toISOString(),
    })),
  }));

  // El turno abierto se muestra siempre (es el estado real del negocio); el
  // historial de cierres ajenos, no.
  const visibles = esEmpleado
    ? sessions.filter((session) => session.status === "OPEN" || session.employeeId === propio?.id)
    : sessions;

  const abierta = visibles.find((session) => session.status === "OPEN");
  const canOperateSession = !esEmpleado || !abierta || abierta.employeeId === propio?.id;

  return (
    <CashWorkspace
      sessions={visibles}
      employees={esEmpleado && propio ? [{ id: propio.id, fullName: propio.fullName }] : employeesRaw}
      canOperateSession={canOperateSession}
      canManageReports={user.role === "admin"}
    />
  );
}
