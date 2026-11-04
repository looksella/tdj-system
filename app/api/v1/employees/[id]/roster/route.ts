import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEmployeeDailySchedules } from "@/lib/employee-schedule-service";
import { guardAccion } from "@/lib/guard-autorizacion";
import { formatScheduleTime } from "@/lib/schedule-time";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccion("team:manage");
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const startValue = query.get("start_date");
  const endValue = query.get("end_date");
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end || start > end) {
    return NextResponse.json(
      { error: "Indica start_date y end_date como fechas YYYY-MM-DD válidas." },
      { status: 400 },
    );
  }
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if ((endExclusive.getTime() - start.getTime()) / 86_400_000 > 90) {
    return NextResponse.json(
      { error: "El rango máximo de consulta es de 90 días." },
      { status: 400 },
    );
  }
  const employee = await db.employee.findUnique({
    where: { id },
    select: { id: true, fullName: true, scheduleType: true },
  });
  if (!employee) return NextResponse.json({ error: "No se encontró la persona." }, { status: 404 });

  const [roster, dailySchedules] = await Promise.all([
    db.employeeRoster.findMany({
      where: { employeeId: id, date: { gte: start, lt: endExclusive } },
      include: { shift: true },
      orderBy: { date: "asc" },
    }),
    getEmployeeDailySchedules(
      [id],
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    ),
  ]);
  const overridesByDate = new Map(
    roster.map((entry) => [entry.date.toISOString().slice(0, 10), entry.isOverride]),
  );
  const scheduleByDate = dailySchedules.get(id);
  const projectedRoster = [];
  for (let date = new Date(start); date < endExclusive; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    const schedule = scheduleByDate?.get(day);
    if (!schedule) continue;
    projectedRoster.push({
      date: day,
      shiftId: schedule.shift?.id ?? null,
      shift: schedule.shift
        ? {
            id: schedule.shift.id,
            name: schedule.shift.name,
            startTime: formatScheduleTime(schedule.shift.startTime),
            endTime: formatScheduleTime(schedule.shift.endTime),
            breakDurationMinutes: schedule.shift.breakDurationMinutes,
          }
        : null,
      scheduleType: schedule.type,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isRestDay: schedule.type === "ROTATING" && schedule.isRestDay === true,
      isOverride: overridesByDate.get(day) ?? false,
    });
  }
  return NextResponse.json({ employee, roster: projectedRoster });
}
