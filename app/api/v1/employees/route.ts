import { NextResponse } from "next/server";
import { saveEmployee } from "@/lib/actions/operations";

const employeeFields = [
  "id",
  "fullName",
  "email",
  "role",
  "monthlySalary",
  "pin",
  "applyLegalDeductions",
  "active",
  "scheduledStart",
  "scheduledEnd",
  "weeklyHours",
  "scheduleType",
  "schedulePatternId",
  "scheduleAnchorDate",
] as const;

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "El cuerpo debe ser un objeto JSON." }, { status: 400 });
    }
    payload = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON no es válido." }, { status: 400 });
  }

  const form = new FormData();
  for (const field of employeeFields) {
    const value = payload[field];
    if (typeof value === "boolean") {
      if (value) form.set(field, "on");
    } else if (typeof value === "string" || typeof value === "number") {
      form.set(field, String(value));
    }
  }
  if (payload.rosterOverrides !== undefined) {
    if (
      typeof payload.rosterOverrides !== "object" ||
      payload.rosterOverrides === null ||
      Array.isArray(payload.rosterOverrides)
    ) {
      return NextResponse.json(
        { error: "Los ajustes del calendario no son válidos." },
        { status: 400 },
      );
    }
    form.set("rosterOverrides", JSON.stringify(payload.rosterOverrides));
  }
  try {
    const employeeId = await saveEmployee(form);
    return NextResponse.json({ id: employeeId }, { status: payload.id ? 200 : 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      return NextResponse.json(
        { error: "No se pudo guardar la persona por un conflicto de datos." },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "No se pudo guardar la persona.";
    const status =
      message.includes("Tu sesión") ||
      message.toLocaleLowerCase("es").includes("permiso") ||
      message.toLocaleLowerCase("es").includes("autorización")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
