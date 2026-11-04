/**
 * Utilidades de fecha del turno, siempre en la zona del negocio.
 *
 * Las páginas de caja, asistencia y planilla necesitan "hoy" y "este mes" tal
 * como los vive el negocio, no como los vive el servidor: en UTC, el cierre de
 * las 18:00 de San Salvador ya es el día siguiente.
 */
import { TIMEZONE } from "@/lib/locale";
import { db } from "@/lib/db";
import type { EffectiveUser } from "@/lib/supabase/helpers";

const partes = (date: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, ...options })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

/** `2026-10-29` en la zona del negocio. */
export function claveDia(date = new Date()) {
  const value = partes(date, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${value.year}-${value.month}-${value.day}`;
}

/** `2026-10-29T14:32`, el formato que espera `<input type="datetime-local">`. */
export function valorLocal(date: Date) {
  const value = partes(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

/** `2026-10` para el selector de período de planilla. */
export function mesActual(date = new Date()) {
  const value = partes(date, { year: "numeric", month: "2-digit" });
  return `${value.year}-${value.month}`;
}

function instanteEnZona(day: string, time: string) {
  const target = Date.parse(`${day}T${time}:00Z`);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = partes(new Date(guess), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const renderedAsUtc = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    );
    guess = target - (renderedAsUtc - guess);
  }
  return new Date(guess);
}

/** Límites del día del negocio, en UTC listo para Prisma. */
export function rangoDelDia(date = new Date()) {
  const day = claveDia(date);
  const nextDayDate = new Date(`${day}T00:00:00Z`);
  nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
  const nextDay = nextDayDate.toISOString().slice(0, 10);
  return {
    day,
    start: instanteEnZona(day, "00:00"),
    end: instanteEnZona(nextDay, "00:00"),
  };
}

/**
 * La ficha del equipo que le corresponde a esta cuenta.
 *
 * El vínculo es el correo: el administrador lo escribe al crear la persona en
 * Planilla. Sin vínculo, un empleado no opera caja ni marcajes (el servidor lo
 * corta igual), así que la UI muestra el mismo aviso en vez de un formulario
 * que va a fallar.
 */
export async function empleadoVinculado(user: EffectiveUser) {
  if (user.role !== "employee" || !user.email) return null;
  return db.employee.findFirst({
    where: { email: { equals: user.email, mode: "insensitive" }, active: true },
  });
}
