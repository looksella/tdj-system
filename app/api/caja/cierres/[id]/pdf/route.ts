import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { urlFirmada } from "@/lib/beon-storage";
import { getEffectiveUser } from "@/lib/supabase/helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para consultar este reporte." }, { status: 401 });
  if (!["admin", "developer", "employee"].includes(user.role)) {
    return NextResponse.json({ error: "No tienes permiso para consultar reportes de caja." }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "El identificador del cierre no es válido." }, { status: 400 });
  }
  const session = await db.cashSession.findUnique({
    where: { id },
    select: { employeeId: true, reportPdfPath: true, status: true },
  });
  if (!session || session.status !== "CLOSED" || !session.reportPdfPath) {
    return NextResponse.json({ error: "El reporte no está disponible." }, { status: 404 });
  }
  if (user.role === "employee") {
    const employee = await db.employee.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!employee || employee.id !== session.employeeId) {
      return NextResponse.json({ error: "Solo puedes consultar tus propios cierres." }, { status: 403 });
    }
  }
  const signedUrl = await urlFirmada(session.reportPdfPath, 60);
  const fileResponse = await fetch(signedUrl, { cache: "no-store" });
  if (!fileResponse.ok) {
    return NextResponse.json({ error: "No se pudo recuperar el PDF almacenado." }, { status: 502 });
  }
  const filename = session.reportPdfPath.split("/").at(-1) ?? "Cierre_Caja.pdf";
  return new Response(await fileResponse.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
