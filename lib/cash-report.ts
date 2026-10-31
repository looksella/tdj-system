import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { TIMEZONE } from "@/lib/locale";
import { guardarDesdeServer } from "@/lib/beon-storage";

const money = (amount: number) => `$${amount.toFixed(2)}`;
const formatter = new Intl.DateTimeFormat("es-SV", {
  timeZone: TIMEZONE,
  dateStyle: "short",
  timeStyle: "short",
});
const dateText = (date: Date) => formatter.format(date);
const paymentLabels: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
  OTHER: "Otro",
};
const cleanName = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");

function renderPdf(session: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  const document = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const pageBottom = () => document.page.height - document.page.margins.bottom;
  const ensureSpace = (height: number) => {
    if (document.y + height > pageBottom()) document.addPage();
  };
  const line = (label: string, value: string, options?: { bold?: boolean; color?: string }) => {
    ensureSpace(34);
    const y = document.y;
    document.font(options?.bold ? "Helvetica-Bold" : "Helvetica").fillColor(options?.color ?? "#202820");
    document.text(label, 42, y, { width: 300 });
    const labelBottom = document.y;
    document.text(value, 380, y, { width: 173, align: "right" });
    document.y = Math.max(labelBottom, document.y) + 2;
  };
  const heading = (text: string) => {
    ensureSpace(32);
    document.moveDown(0.7).font("Helvetica-Bold").fontSize(12).fillColor("#246b50").text(text);
    document.moveDown(0.35).font("Helvetica").fontSize(9).fillColor("#202820");
  };

  const sales = session.movements.filter((movement) => movement.type === "SALE");
  const refunds = session.movements.filter((movement) => movement.type === "REFUND");
  const totalSales = sales.reduce((sum, movement) => sum + movement.amount.toNumber(), 0);
  const totalRefunds = refunds.reduce((sum, movement) => sum + movement.amount.toNumber(), 0);
  const methodTotal = (method: string) =>
    sales.filter((movement) => movement.method === method).reduce((sum, movement) => sum + movement.amount.toNumber(), 0)
    - refunds.filter((movement) => movement.method === method).reduce((sum, movement) => sum + movement.amount.toNumber(), 0);

  document.roundedRect(42, 42, 42, 42, 10).fill("#246b50");
  document.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff").text("BN", 42, 56, { width: 42, align: "center" });
  document.font("Helvetica-Bold").fontSize(18).fillColor("#246b50").text(process.env.BUSINESS_NAME ?? "Buen Negocio", 96, 48);
  document.moveDown(0.25).fontSize(14).fillColor("#202820").text("Reporte de Cierre de Caja");
  document.moveDown(0.2).font("Helvetica").fontSize(9).fillColor("#58615a");
  document.text(`Cierre #${session.id}`);
  document.text(`Apertura: ${dateText(session.openedAt)}    Cierre: ${session.closedAt ? dateText(session.closedAt) : "Pendiente"}`);
  document.text(`Cajero: ${session.employee.fullName}    Caja: Caja 1 / ${process.env.BUSINESS_BRANCH ?? "Principal"}`);
  if (session.openingNotes) document.text(`Observaciones de apertura: ${session.openingNotes}`);
  document.moveDown(0.5).strokeColor("#d8dfd9").moveTo(42, document.y).lineTo(553, document.y).stroke();

  heading("Resumen financiero");
  line("Monto inicial", money(session.openingFloat.toNumber()));
  line("(+) Ventas totales", money(totalSales));
  line("(-) Descuentos", money(0));
  line("(-) Devoluciones", money(totalRefunds));
  line("(=) Ventas netas", money(totalSales - totalRefunds), { bold: true });
  document.moveDown(0.3);
  for (const [label, method] of [["Efectivo", "CASH"], ["Tarjeta", "CARD"], ["Transferencia", "TRANSFER"], ["Crédito / otro", "CREDIT"]] as const) {
    line(`Cobros netos · ${label}`, money(methodTotal(method)));
  }
  line("Otros medios", money(methodTotal("OTHER")));

  heading("Detalle de transacciones");
  if (session.movements.length === 0) {
    document.text("Sin movimientos en la jornada.");
  } else {
    const columns = [42, 105, 190, 350, 425, 515];
    const headers = ["Hora", "Ticket", "Cliente / concepto", "Total", "Método"];
    const drawRow = (values: string[], bold = false) => {
      ensureSpace(26);
      const y = document.y;
      document.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#202820");
      values.forEach((value, index) => {
        document.text(value, columns[index], y, { width: columns[index + 1] - columns[index] - 5, height: 24, ellipsis: true });
      });
      document.moveDown(1.35);
    };
    drawRow(headers, true);
    document.strokeColor("#d8dfd9").moveTo(42, document.y - 5).lineTo(553, document.y - 5).stroke();
    for (const movement of session.movements) {
      const sale = movement.sale ?? movement.referencedSale;
      const sign = movement.type === "REFUND" || movement.type === "EXPENSE" ? "-" : "";
      drawRow([
        new Intl.DateTimeFormat("es-SV", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(movement.occurredAt),
        sale ? `#${sale.number}` : movement.referenceId ?? "—",
        sale?.customer?.name ?? movement.description,
        `${sign}${money(movement.amount.toNumber())}`,
        paymentLabels[movement.method] ?? movement.method,
      ]);
    }
  }

  heading("Cuadre de efectivo");
  line("Efectivo esperado", money(session.expectedCash?.toNumber() ?? session.openingFloat.toNumber()), { bold: true });
  line("Efectivo contado", money(session.countedCash?.toNumber() ?? 0), { bold: true });
  const difference = session.difference?.toNumber() ?? 0;
  line("Diferencia", money(difference), {
    bold: true,
    color: difference < 0 ? "#b42318" : "#16803c",
  });
  if (session.differenceObservation) line("Observación de diferencia", session.differenceObservation);
  if (session.notes) line("Notas", session.notes);
  if (session.annulmentReason) line("Anulación administrativa", session.annulmentReason);

  ensureSpace(76);
  document.moveDown(2);
  const signY = document.y;
  document.strokeColor("#58615a").moveTo(55, signY).lineTo(245, signY).stroke();
  document.moveTo(350, signY).lineTo(540, signY).stroke();
  document.fontSize(8).fillColor("#58615a").text("Firma del cajero", 55, signY + 6, { width: 190, align: "center" });
  document.text("Firma del supervisor", 350, signY + 6, { width: 190, align: "center" });
  document.moveDown(3).fontSize(8).text("Documento de control interno generado por el sistema", { align: "center" });
  document.end();
  return result;
}

async function loadSession(sessionId: string) {
  return db.cashSession.findUnique({
    where: { id: sessionId },
    include: {
      employee: true,
      movements: {
        orderBy: { occurredAt: "asc" },
        include: {
          sale: { include: { customer: { select: { name: true } } } },
          referencedSale: { include: { customer: { select: { name: true } } } },
        },
      },
    },
  });
}

export async function storeCashReport(sessionId: string) {
  const session = await loadSession(sessionId);
  if (!session || session.status !== "CLOSED") throw new Error("Solo se puede generar el reporte de una caja cerrada.");
  const pdf = await renderPdf(session);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(session.closedAt ?? new Date());
  const filename = `Cierre_Caja_${session.id}_${day}_${cleanName(session.employee.fullName)}.pdf`;
  const path = `cierres/${session.id}/${filename}`;
  await guardarDesdeServer(path, pdf, "application/pdf", true);
  await db.cashSession.update({ where: { id: session.id }, data: { reportPdfPath: path } });
  return { path, filename };
}
