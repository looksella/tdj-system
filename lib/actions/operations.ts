"use server";
/**
 * Server Actions de turno: caja, asistencia y planilla.
 *
 * Separado de `lib/actions/commerce.ts` (inventario y ventas) porque acá manda
 * la persona, no el producto: cada acción toca una ficha de `Employee`.
 *
 * Permisos (ver `lib/auth-helpers.ts`):
 * - `cash:operate` y `attendance:punch`: empleado y administrador.
 * - `attendance:manage`, `payroll:manage` y `team:manage`: solo administrador.
 *
 * Además del chequeo de rol, un usuario con rol `employee` solo puede operar
 * sobre SU ficha: el servidor resuelve la ficha por el correo de la sesión y
 * descarta cualquier id que llegue del formulario. Ocultar el selector en la
 * UI no sería suficiente.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { storeCashReport } from "@/lib/cash-report";
import { cents, lockCashOperations } from "@/lib/caja";
import { db } from "@/lib/db";
import { urlFirmada } from "@/lib/beon-storage";
import { isFeatureEnabled } from "@/lib/features/resolve";
import { guardAccion } from "@/lib/guard-autorizacion";
import { TIMEZONE } from "@/lib/locale";
import {
  calculateAttendanceHours,
  calculatePayroll,
  calculateRotatingAttendanceHours,
} from "@/lib/payroll";
import {
  getEmployeeDailySchedule,
  getEmployeeDailySchedules,
} from "@/lib/employee-schedule-service";
import { DEFAULT_LABOR_LIMITS, isValidScheduleDate, shiftMetrics } from "@/lib/schedule-rules";
import {
  clearFutureEmployeeRoster,
  projectEmployeeRoster,
  type RosterOverrides,
} from "@/lib/employee-schedule-service";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import { rangoDelDia } from "@/lib/turno";

const hashPin = (pin: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
};

function verifyPin(pin: string, stored: string) {
  const [salt, expected] = stored.split(":");
  const actual = expected ? scryptSync(pin, salt, 64) : createHash("sha256").update(pin).digest();
  const expectedBytes = Buffer.from(expected ?? stored, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

const numberFrom = (form: FormData, key: string) => Number(form.get(key) ?? 0);
const textFrom = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const denominationValues = [100, 50, 20, 10, 5, 1, 0.25, 0.1, 0.05] as const;

function readDenominations(form: FormData, prefix: string) {
  const counts = Object.fromEntries(
    denominationValues.map((value) => {
      const raw = form.get(`${prefix}${String(value).replace(".", "_")}`);
      const count = raw === null || raw === "" ? 0 : Number(raw);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Las cantidades de billetes y monedas deben ser enteros no negativos.");
      return [String(value), count];
    }),
  );
  const total = denominationValues.reduce(
    (sum, value) => sum + value * Number(counts[String(value)]),
    0,
  );
  const roundedTotal = Math.round(total * 100) / 100;
  if (!Number.isFinite(roundedTotal) || roundedTotal > 99_999_999.99)
    throw new Error("El total excede el límite permitido para caja.");
  return { counts, total: roundedTotal };
}

const refresh = (...paths: string[]) => paths.forEach((path) => revalidatePath(path));

/**
 * Niega con el texto del guard (ya viene en el idioma del negocio) y, si el
 * rol es `employee`, devuelve la ficha del equipo que le pertenece.
 *
 * `null` en `vinculado` con rol `employee` significa "esta cuenta todavía no
 * tiene ficha": se corta con un mensaje que el dueño puede resolver desde
 * Planilla, en vez de dejar pasar la acción como si fuera el administrador.
 */
async function contextoDeOperacion(accion: string) {
  const negado = await guardAccion(accion);
  if (negado) throw new Error(negado);
  const user = await getEffectiveUser();
  if (!user) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  if (user.role !== "employee") return { esEmpleado: false as const, empleado: null, user };
  const empleado = user.email
    ? await db.employee.findFirst({ where: { email: { equals: user.email, mode: "insensitive" } } })
    : null;
  return { esEmpleado: true as const, empleado, user };
}

const SIN_FICHA =
  "Tu usuario todavía no está vinculado a una ficha del equipo. Pedile al administrador que registre tu correo en Planilla.";

// --- Caja -------------------------------------------------------------------

export async function openCash(form: FormData) {
  const { esEmpleado, empleado } = await contextoDeOperacion("cash:operate");
  if (esEmpleado && !empleado) throw new Error(SIN_FICHA);
  // El id del formulario solo vale para el administrador.
  const employeeId = esEmpleado ? empleado!.id : textFrom(form, "employeeId");
  const opening = readDenominations(form, "open_");
  if (!employeeId || opening.total <= 0)
    throw new Error("Registra el fondo inicial contando sus denominaciones.");
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const requiereAsistencia = await isFeatureEnabled("require-attendance-to-open-cash");
  const entryMark = requiereAsistencia
    ? await db.attendanceMark.findFirst({
        where: {
          employeeId,
          type: "ENTRY",
          markedAt: { gte: new Date(`${day}T00:00:00-06:00`), lte: now },
        },
        orderBy: { markedAt: "asc" },
      })
    : null;
  if (requiereAsistencia && !entryMark)
    throw new Error("Primero registra la entrada de la persona con su PIN.");
  await db.$transaction(async (tx) => {
    await lockCashOperations(tx);
    if (await tx.cashSession.count({ where: { status: "OPEN" } }))
      throw new Error("Ya hay una caja abierta.");
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { active: true },
    });
    if (!employee?.active) throw new Error("Selecciona una persona activa.");
    await tx.cashSession.create({
      data: {
        employeeId,
        openingMarkId: entryMark?.id ?? null,
        openingFloat: opening.total,
        openingDenominations: opening.counts,
        openedAt: new Date(),
        openingNotes: textFrom(form, "openingNotes") || null,
      },
    });
  });
  refresh("/", "/caja");
}

export async function closeCash(form: FormData) {
  const { esEmpleado, empleado } = await contextoDeOperacion("cash:operate");
  const sessionId = textFrom(form, "sessionId");
  const closing = readDenominations(form, "close_");
  const countedCash = closing.total;
  if (!sessionId) throw new Error("No se encontró el turno que quieres cerrar.");
  await db.$transaction(async (tx) => {
    await lockCashOperations(tx);
    const session = await tx.cashSession.findUnique({
      where: { id: sessionId },
      include: { movements: true },
    });
    if (!session || session.status !== "OPEN") throw new Error("Esta caja ya fue cerrada.");
    if (esEmpleado && session.employeeId !== empleado?.id)
      throw new Error("Solo puedes cerrar tu propia caja.");
    const now = new Date();
    if (now < session.openedAt)
      throw new Error("La fecha de cierre no puede ser anterior a la apertura.");
    const pending = await tx.venta.count({
      where: {
        soldAt: { gte: session.openedAt, lte: now },
        status: {
          in: [
            "pendiente",
            "PENDIENTE",
            "pending",
            "PENDING",
            "procesando",
            "PROCESANDO",
            "processing",
            "PROCESSING",
            "en proceso",
            "EN PROCESO",
          ],
        },
      },
    });
    if (pending) throw new Error("No puedes cerrar caja mientras haya ventas pendientes de cobro.");
    const cashMovements = session.movements.filter((move) => move.method === "CASH");
    const expectedCents =
      cents(session.openingFloat.toNumber()) +
      cashMovements
        .filter((move) => move.type === "SALE" || move.type === "INCOME")
        .reduce((sum, move) => sum + cents(move.amount.toNumber()), 0) -
      cashMovements
        .filter((move) => move.type === "EXPENSE" || move.type === "REFUND")
        .reduce((sum, move) => sum + cents(move.amount.toNumber()), 0);
    const differenceCents = cents(countedCash) - expectedCents;
    const differenceObservation = textFrom(form, "differenceObservation");
    if (differenceCents !== 0 && !differenceObservation) {
      throw new Error("Explica la diferencia entre el efectivo contado y el esperado.");
    }
    const changed = await tx.cashSession.updateMany({
      where: { id: sessionId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closedAt: now,
        countedCash: (cents(countedCash) / 100).toFixed(2),
        expectedCash: (expectedCents / 100).toFixed(2),
        difference: (differenceCents / 100).toFixed(2),
        closingDenominations: closing.counts,
        notes: textFrom(form, "notes") || null,
        differenceObservation: differenceObservation || null,
      },
    });
    if (changed.count !== 1)
      throw new Error(
        "La caja cambió mientras se intentaba cerrar. Actualiza e inténtalo de nuevo.",
      );
  });
  try {
    await storeCashReport(sessionId);
  } catch (error) {
    console.warn(
      "[closeCash] No se pudo guardar el PDF del cierre, pero la caja quedó cerrada.",
      error,
    );
  }
  refresh("/", "/caja");
}

export async function addCashMovement(form: FormData) {
  const { esEmpleado, empleado } = await contextoDeOperacion("cash:operate");
  const sessionId = textFrom(form, "sessionId");
  const amount = numberFrom(form, "amount");
  const type = textFrom(form, "type");
  const method = textFrom(form, "method");
  if (!Number.isFinite(amount) || cents(amount) <= 0 || !textFrom(form, "description"))
    throw new Error("Completa un concepto y un importe válido.");
  if (
    !["INCOME", "EXPENSE"].includes(type) ||
    !["CASH", "CARD", "TRANSFER", "CREDIT", "OTHER"].includes(method)
  ) {
    throw new Error("Elige un tipo y un medio de pago válidos.");
  }
  await db.$transaction(async (tx) => {
    await lockCashOperations(tx);
    const session = await tx.cashSession.findUnique({
      where: { id: sessionId },
      select: { status: true, employeeId: true },
    });
    if (session?.status !== "OPEN")
      throw new Error("Solo puedes agregar movimientos a una caja abierta.");
    if (esEmpleado && session.employeeId !== empleado?.id)
      throw new Error("Solo puedes operar tu propia caja.");
    await tx.cashMovement.create({
      data: {
        sessionId,
        type: type as "INCOME" | "EXPENSE",
        method: method as "CASH" | "CARD" | "TRANSFER" | "CREDIT" | "OTHER",
        amount: (cents(amount) / 100).toFixed(2),
        description: textFrom(form, "description"),
      },
    });
  });
  refresh("/", "/caja");
}

export async function updateCashMovement(form: FormData) {
  const { esEmpleado, empleado } = await contextoDeOperacion("cash:operate");
  const id = textFrom(form, "id");
  const amount = numberFrom(form, "amount");
  const sessionId = textFrom(form, "sessionId");
  const type = textFrom(form, "type");
  const method = textFrom(form, "method");
  if (
    !Number.isFinite(amount) ||
    cents(amount) <= 0 ||
    !textFrom(form, "description") ||
    !["INCOME", "EXPENSE"].includes(type) ||
    !["CASH", "CARD", "TRANSFER", "CREDIT", "OTHER"].includes(method)
  ) {
    throw new Error("Revisa el tipo, medio, concepto e importe del movimiento.");
  }
  await db.$transaction(async (tx) => {
    await lockCashOperations(tx);
    const movement = await tx.cashMovement.findUnique({
      where: { id },
      include: { session: true },
    });
    if (
      !movement ||
      movement.sessionId !== sessionId ||
      movement.saleId ||
      movement.session.status !== "OPEN"
    ) {
      throw new Error("Solo se pueden editar movimientos manuales de una caja abierta.");
    }
    if (esEmpleado && movement.session.employeeId !== empleado?.id)
      throw new Error("Solo puedes operar tu propia caja.");
    await tx.cashMovement.update({
      where: { id },
      data: {
        amount: (cents(amount) / 100).toFixed(2),
        description: textFrom(form, "description"),
        type: type as "INCOME" | "EXPENSE",
        method: method as "CASH" | "CARD" | "TRANSFER" | "CREDIT" | "OTHER",
      },
    });
  });
  refresh("/", "/caja");
}

export async function deleteCashMovement(form: FormData) {
  const { esEmpleado, empleado } = await contextoDeOperacion("cash:operate");
  const id = textFrom(form, "id");
  const sessionId = textFrom(form, "sessionId");
  await db.$transaction(async (tx) => {
    await lockCashOperations(tx);
    const movement = await tx.cashMovement.findUnique({
      where: { id },
      include: { session: true },
    });
    if (
      !movement ||
      movement.sessionId !== sessionId ||
      movement.saleId ||
      movement.session.status !== "OPEN"
    ) {
      throw new Error(
        "La caja está cerrada o el movimiento no es manual; no se puede alterar su arqueo.",
      );
    }
    if (esEmpleado && movement.session.employeeId !== empleado?.id)
      throw new Error("Solo puedes operar tu propia caja.");
    await tx.cashMovement.delete({ where: { id } });
  });
  refresh("/", "/caja");
}

export async function getCashReportLink(sessionId: string) {
  const { esEmpleado, empleado } = await contextoDeOperacion("cash:operate");
  if (!sessionId) throw new Error("No se encontró el cierre solicitado.");
  let session = await db.cashSession.findUnique({
    where: { id: sessionId },
    include: { employee: true, movements: { where: { type: "SALE" } } },
  });
  if (!session || session.status !== "CLOSED")
    throw new Error("El reporte estará disponible después de cerrar la caja.");
  if (esEmpleado && session.employeeId !== empleado?.id)
    throw new Error("Solo puedes consultar tus propios cierres.");
  if (!session.reportPdfPath) {
    await storeCashReport(sessionId);
    session = await db.cashSession.findUnique({
      where: { id: sessionId },
      include: { employee: true, movements: { where: { type: "SALE" } } },
    });
  }
  if (!session?.reportPdfPath) throw new Error("No se pudo guardar el reporte PDF.");
  const pdfUrl = await urlFirmada(session.reportPdfPath, 86400);
  const filename = session.reportPdfPath.split("/").at(-1) ?? "Cierre_Caja.pdf";
  const total = session.movements.reduce((sum, movement) => sum + movement.amount.toNumber(), 0);
  const day = new Intl.DateTimeFormat("es-SV", { timeZone: TIMEZONE, dateStyle: "short" }).format(
    session.closedAt ?? new Date(),
  );
  const text = `*REPORTE CIERRE DE CAJA*\nFecha: ${day}\nCajero: ${session.employee.fullName}\nVentas: $${total.toFixed(2)}\nDescarga PDF: ${pdfUrl}`;
  const ownerPhone = process.env.OWNER_WHATSAPP_NUMBER?.replace(/\D/g, "") || null;
  return { pdfUrl, filename, text, ownerPhone };
}

export async function annulCashSession(sessionId: string, reason: string) {
  const { user } = await contextoDeOperacion("cash:manage");
  const cleanReason = reason.trim();
  if (user.role !== "admin") throw new Error("Solo el administrador puede anular un cierre.");
  if (!sessionId || !cleanReason) throw new Error("Indica el cierre y el motivo de la anulación.");
  await db.$transaction(async (tx) => {
    await lockCashOperations(tx);
    const session = await tx.cashSession.findUnique({
      where: { id: sessionId },
      select: { status: true, annulledAt: true },
    });
    if (!session || session.status !== "CLOSED" || session.annulledAt)
      throw new Error("El cierre no existe o ya fue anulado.");
    await tx.cashSession.update({
      where: { id: sessionId },
      data: { annulledAt: new Date(), annulledBy: user.email, annulmentReason: cleanReason },
    });
  });
  let reportError: string | null = null;
  try {
    await storeCashReport(sessionId);
  } catch (error) {
    reportError =
      error instanceof Error ? error.message : "Error desconocido al actualizar el reporte.";
  }
  refresh("/caja");
  if (reportError)
    throw new Error(
      `El cierre se anuló con auditoría, pero el PDF no se pudo actualizar: ${reportError}`,
    );
}

// --- Asistencia -------------------------------------------------------------

export async function recordPunch(form: FormData) {
  const { esEmpleado, empleado } = await contextoDeOperacion("attendance:punch");
  if (esEmpleado && !empleado) throw new Error(SIN_FICHA);
  // Un empleado solo marca por sí mismo: el id del formulario no se usa.
  const employeeId = esEmpleado ? empleado!.id : textFrom(form, "employeeId");
  const pin = textFrom(form, "pin");
  const type = textFrom(form, "type") as "ENTRY" | "LUNCH_START" | "LUNCH_END" | "EXIT";
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee?.active || !verifyPin(pin, employee.pinHash))
    throw new Error("El PIN no coincide con una persona activa.");
  const now = new Date();
  const { day, start: dayStart } = rangoDelDia(now);
  if (type === "ENTRY") {
    const schedule = await getEmployeeDailySchedule(employeeId, day);
    if (schedule?.type === "ROTATING" && schedule.isRestDay) {
      throw new Error("Hoy es día de descanso según el calendario asignado.");
    }
  }
  const latest = await db.attendanceMark.findFirst({
    where: {
      employeeId,
      markedAt: { gte: new Date(dayStart.getTime() - 24 * 60 * 60 * 1000), lte: now },
    },
    orderBy: { markedAt: "desc" },
  });
  if (
    latest &&
    latest.type !== "EXIT" &&
    now.getTime() - latest.markedAt.getTime() > 18 * 60 * 60 * 1000
  ) {
    throw new Error(
      "Hay un turno anterior sin cerrar. Pide al administrador que revise los marcajes.",
    );
  }
  const expected: Record<string, string> = {
    ENTRY: "EXIT",
    LUNCH_START: "ENTRY",
    LUNCH_END: "LUNCH_START",
    EXIT: "LUNCH_END",
  };
  if ((!latest && type !== "ENTRY") || (latest && expected[type] !== latest.type))
    throw new Error("Sigue el orden de marcajes: entrada, almuerzo, regreso y salida.");
  await db.attendanceMark.create({ data: { employeeId, type, markedAt: now } });
  refresh("/", "/asistencia");
}

export async function updateAttendanceMark(form: FormData) {
  await contextoDeOperacion("attendance:manage");
  const id = textFrom(form, "id");
  const date = new Date(textFrom(form, "markedAt"));
  if (!Number.isFinite(date.getTime())) throw new Error("La fecha del marcaje no es válida.");
  await db.attendanceMark.update({
    where: { id },
    data: {
      type: textFrom(form, "type") as "ENTRY" | "LUNCH_START" | "LUNCH_END" | "EXIT",
      markedAt: date,
    },
  });
  refresh("/", "/asistencia", "/planilla");
}

export async function deleteAttendanceMark(form: FormData) {
  await contextoDeOperacion("attendance:manage");
  await db.attendanceMark.delete({ where: { id: textFrom(form, "id") } });
  refresh("/", "/asistencia", "/planilla");
}

export async function updateLaborSettings(form: FormData) {
  await contextoDeOperacion("attendance:manage");
  const graceMinutes = Math.max(0, Math.min(60, numberFrom(form, "graceMinutes")));
  const weekStartsOn = numberFrom(form, "weekStartsOn");
  if (![0, 1].includes(weekStartsOn)) {
    throw new Error("Selecciona lunes o domingo como inicio de semana.");
  }
  const current = await db.laborSettings.findFirst();
  if (current)
    await db.laborSettings.update({
      where: { id: current.id },
      data: { graceMinutes, weekStartsOn },
    });
  else await db.laborSettings.create({ data: { graceMinutes, weekStartsOn } });
  refresh("/", "/asistencia", "/planilla");
}

// --- Equipo y planilla (solo administrador) ---------------------------------

export async function saveEmployee(form: FormData) {
  await contextoDeOperacion("team:manage");
  const id = textFrom(form, "id");
  const fullName = textFrom(form, "fullName");
  const pin = textFrom(form, "pin");
  const email = textFrom(form, "email").toLowerCase();
  const monthlySalary = numberFrom(form, "monthlySalary");
  const scheduleType = textFrom(form, "scheduleType") || "FIXED";
  const scheduledStart = textFrom(form, "scheduledStart");
  const scheduledEnd = textFrom(form, "scheduledEnd");
  const weeklyHoursValue = form.get("weeklyHours");
  const weeklyHours =
    weeklyHoursValue === null || weeklyHoursValue === "" ? 44 : numberFrom(form, "weeklyHours");
  const patternId = textFrom(form, "schedulePatternId");
  const anchorDate = textFrom(form, "scheduleAnchorDate");
  let rosterOverrides: RosterOverrides = {};
  try {
    const rawOverrides = textFrom(form, "rosterOverrides");
    const parsed: unknown = rawOverrides ? JSON.parse(rawOverrides) : {};
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.entries(parsed).some(
        ([date, shiftId]) =>
          !isValidScheduleDate(date) || (shiftId !== null && typeof shiftId !== "string"),
      )
    ) {
      throw new Error();
    }
    rosterOverrides = parsed as RosterOverrides;
  } catch {
    throw new Error("Los ajustes por fecha del patrón no son válidos.");
  }
  if (
    !fullName ||
    !Number.isFinite(monthlySalary) ||
    monthlySalary < 1 ||
    (!id && !/^\d{4,6}$/.test(pin)) ||
    (Boolean(pin) && !/^\d{4,6}$/.test(pin)) ||
    !["FIXED", "ROTATING"].includes(scheduleType)
  )
    throw new Error("Revisa el nombre, el salario y el PIN de 4 a 6 dígitos.");
  if (
    scheduleType === "FIXED" &&
    (!/^\d{2}:\d{2}$/.test(scheduledStart) ||
      !/^\d{2}:\d{2}$/.test(scheduledEnd) ||
      !Number.isFinite(weeklyHours) ||
      weeklyHours < 1 ||
      weeklyHours > 60)
  ) {
    throw new Error("Revisa las horas de entrada, salida y jornada semanal.");
  }
  if (scheduleType === "ROTATING" && (!patternId || !anchorDate)) {
    throw new Error("Selecciona una plantilla y la fecha inicial de la jornada rotativa.");
  }
  if (scheduleType === "ROTATING" && !isValidScheduleDate(anchorDate)) {
    throw new Error("La fecha inicial del ciclo no es válida.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("El correo de la cuenta no tiene un formato válido.");
  const data = {
    fullName,
    role: textFrom(form, "role"),
    monthlySalary,
    email: email || null,
    applyLegalDeductions: textFrom(form, "applyLegalDeductions") === "on",
    active: textFrom(form, "active") === "on",
    scheduledStart: scheduledStart || "08:00",
    scheduledEnd: scheduledEnd || "17:00",
    weeklyHours,
    scheduleType,
    schedulePatternId: scheduleType === "ROTATING" ? patternId : null,
    scheduleAnchorDate:
      scheduleType === "ROTATING" ? new Date(`${anchorDate}T00:00:00.000Z`) : null,
    ...(pin ? { pinHash: hashPin(pin) } : {}),
  };
  try {
    const employeeId = await db.$transaction(async (tx) => {
      const employee = id
        ? await tx.employee.update({ where: { id }, data })
        : await tx.employee.create({ data: { ...data, pinHash: hashPin(pin) } });
      if (scheduleType === "ROTATING") {
        const projection = await projectEmployeeRoster(
          tx,
          employee.id,
          patternId,
          anchorDate,
          rosterOverrides,
        );
        await tx.employee.update({
          where: { id: employee.id },
          data: { weeklyHours: projection.averageWeeklyHours },
        });
      } else {
        await clearFutureEmployeeRoster(tx, employee.id);
      }
      return employee.id;
    });
    refresh("/", "/planilla", "/asistencia", "/caja");
    return employeeId;
  } catch (error) {
    // El correo es único: dos fichas con el mismo correo dejarían a una sola
    // cuenta con dos turnos posibles. El mensaje de Prisma no se le muestra
    // al dueño.
    if (typeof error === "object" && error !== null && "code" in error) {
      const prismaError = error as { code?: string; meta?: { target?: unknown } };
      if (
        prismaError.code === "P2002" &&
        Array.isArray(prismaError.meta?.target) &&
        prismaError.meta.target.includes("email")
      ) {
        throw new Error("Ese correo ya está vinculado a otra persona del equipo.");
      }
    }
    throw error;
  }
}

export async function deleteEmployee(form: FormData) {
  await contextoDeOperacion("team:manage");
  const id = textFrom(form, "id");
  const [cash, marks, payroll] = await Promise.all([
    db.cashSession.count({ where: { employeeId: id } }),
    db.attendanceMark.count({ where: { employeeId: id } }),
    db.payrollLine.count({ where: { employeeId: id } }),
  ]);
  // Con historial no se borra: se desactiva. Un borrado se llevaría el arqueo
  // o la liquidación de meses ya pagados.
  if (cash + marks + payroll) {
    await db.employee.update({ where: { id }, data: { active: false } });
  } else {
    await db.employee.delete({ where: { id } });
  }
  refresh("/", "/planilla", "/asistencia", "/caja");
}

export async function generatePayroll(form: FormData) {
  await contextoDeOperacion("payroll:manage");
  const month = textFrom(form, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Selecciona un período válido.");
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const periodStart = new Date(`${month}-01T00:00:00-06:00`);
  const periodEnd = new Date(`${month}-${String(lastDay).padStart(2, "0")}T23:59:59-06:00`);
  const [employees, settings] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        scheduleType: true,
        scheduledStart: true,
        weeklyHours: true,
        monthlySalary: true,
        applyLegalDeductions: true,
      },
    }),
    db.laborSettings.findFirst(),
  ]);
  const graceMinutes = settings?.graceMinutes ?? 10;
  const marks = await db.attendanceMark.findMany({
    where: {
      employeeId: { in: employees.map((employee) => employee.id) },
      markedAt: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { markedAt: "asc" },
  });
  const existingLines = await db.payrollLine.findMany({ where: { periodStart, periodEnd } });
  const previousByEmployee = new Map(existingLines.map((line) => [line.employeeId, line]));
  const firstDay = `${month}-01`;
  const lastDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const rotatingEmployees = employees.filter((employee) => employee.scheduleType === "ROTATING");
  const rotatingSchedules = rotatingEmployees.length
    ? await getEmployeeDailySchedules(
        rotatingEmployees.map((employee) => employee.id),
        firstDay,
        lastDate,
      )
    : new Map();
  const laborLimits = {
    dailyDayLimit: Number(settings?.dailyDayLimit ?? DEFAULT_LABOR_LIMITS.dailyDayLimit),
    weeklyDayLimit: Number(settings?.weeklyDayLimit ?? DEFAULT_LABOR_LIMITS.weeklyDayLimit),
    dailyNightLimit: Number(settings?.dailyNightLimit ?? DEFAULT_LABOR_LIMITS.dailyNightLimit),
    weeklyNightLimit: Number(settings?.weeklyNightLimit ?? DEFAULT_LABOR_LIMITS.weeklyNightLimit),
    minimumRestHours: settings?.minimumRestHours ?? DEFAULT_LABOR_LIMITS.minimumRestHours,
  };
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  for (const employee of employees) {
    const employeeMarks = marks.filter((mark) => mark.employeeId === employee.id);
    const employeeSchedule = rotatingSchedules.get(employee.id);
    const hours = employeeSchedule
      ? calculateRotatingAttendanceHours(
          employeeMarks,
          new Map(
            [...employeeSchedule].map(([date, schedule]) => [
              date,
              {
                startTime: schedule.startTime,
                legalClass: schedule.shift
                  ? shiftMetrics(schedule.shift, laborLimits).legalClass
                  : null,
              },
            ]),
          ),
          graceMinutes,
          laborLimits,
          weekStartsOn,
        )
      : calculateAttendanceHours(
          employeeMarks,
          employee.scheduledStart,
          graceMinutes,
          weekStartsOn,
        );
    const previous = previousByEmployee.get(employee.id);
    const bonuses = Number(previous?.bonuses ?? 0);
    const adjustments = Number(previous?.adjustments ?? 0);
    const holidayHours = Number(previous?.holidayHours ?? 0);
    const pay = calculatePayroll(
      Number(employee.monthlySalary),
      hours,
      bonuses,
      adjustments,
      employee.applyLegalDeductions,
      holidayHours,
      Number(employee.weeklyHours),
    );
    await db.payrollLine.upsert({
      where: {
        employeeId_periodStart_periodEnd: { employeeId: employee.id, periodStart, periodEnd },
      },
      create: {
        employeeId: employee.id,
        periodStart,
        periodEnd,
        ...hours,
        holidayHours,
        compensatoryDayOff: previous?.compensatoryDayOff ?? false,
        bonuses,
        adjustments,
        basePay: pay.basePay,
        overtimePay: pay.overtimePay,
        grossPay: pay.grossPay,
        isssDeduction: pay.isssDeduction,
        afpDeduction: pay.afpDeduction,
        incomeTaxDeduction: pay.incomeTaxDeduction,
        netPay: pay.netPay,
        legalDeductions: employee.applyLegalDeductions,
        status: previous?.status ?? "DRAFT",
      },
      update: {
        ...hours,
        holidayHours,
        bonuses,
        adjustments,
        compensatoryDayOff: previous?.compensatoryDayOff ?? false,
        basePay: pay.basePay,
        overtimePay: pay.overtimePay,
        grossPay: pay.grossPay,
        isssDeduction: pay.isssDeduction,
        afpDeduction: pay.afpDeduction,
        incomeTaxDeduction: pay.incomeTaxDeduction,
        netPay: pay.netPay,
        legalDeductions: employee.applyLegalDeductions,
        status: previous?.status ?? "DRAFT",
      },
    });
  }
  refresh("/", "/planilla");
}

export async function updatePayroll(form: FormData) {
  await contextoDeOperacion("payroll:manage");
  const id = textFrom(form, "id");
  const line = await db.payrollLine.findUnique({ where: { id }, include: { employee: true } });
  if (!line) throw new Error("No se encontró la liquidación.");
  const bonuses = numberFrom(form, "bonuses");
  const adjustments = numberFrom(form, "adjustments");
  const holidayHours = Math.max(0, numberFrom(form, "holidayHours"));
  const compensatoryDayOff = textFrom(form, "compensatoryDayOff") === "on";
  const hours = {
    ordinaryDayHours: Number(line.ordinaryDayHours),
    ordinaryNightHours: Number(line.ordinaryNightHours),
    extraDayHours: Number(line.extraDayHours),
    extraNightHours: Number(line.extraNightHours),
    tardyMinutes: line.tardyMinutes,
  };
  const pay = calculatePayroll(
    Number(line.employee.monthlySalary),
    hours,
    bonuses,
    adjustments,
    line.legalDeductions,
    holidayHours,
    Number(line.employee.weeklyHours),
  );
  await db.payrollLine.update({
    where: { id },
    data: {
      bonuses,
      adjustments,
      holidayHours,
      compensatoryDayOff,
      basePay: pay.basePay,
      overtimePay: pay.overtimePay,
      grossPay: pay.grossPay,
      isssDeduction: pay.isssDeduction,
      afpDeduction: pay.afpDeduction,
      incomeTaxDeduction: pay.incomeTaxDeduction,
      netPay: pay.netPay,
      status: textFrom(form, "status") || line.status,
    },
  });
  refresh("/", "/planilla");
}

export async function deletePayroll(form: FormData) {
  await contextoDeOperacion("payroll:manage");
  await db.payrollLine.delete({ where: { id: textFrom(form, "id") } });
  refresh("/", "/planilla");
}
