"use client";
import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Calculator,
  CircleDollarSign,
  FileDown,
  FileText,
  Plus,
  Printer,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import {
  deleteEmployee,
  deletePayroll,
  generatePayroll,
  saveEmployee,
  updatePayroll,
} from "@/lib/actions/operations";
import { formatDate, formatMoney } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DocumentoA4, PrintFrame, type PrintFrameHandle } from "@/lib/print";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidScheduleDate, shiftMetrics, type ShiftRule } from "@/lib/schedule-rules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
type Employee = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  monthlySalary: number;
  applyLegalDeductions: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  weeklyHours: number;
  scheduleType: string;
  schedulePatternId: string | null;
  scheduleAnchorDate: string | null;
  rosters: { date: string; shiftId: string | null; isOverride: boolean }[];
  active: boolean;
};
type ShiftOption = ShiftRule & { startTime: string; endTime: string };
type PatternOption = {
  id: string;
  name: string;
  cycleDays: number;
  details: { daySequence: number; shiftId: string | null; isRestDay: boolean }[];
};
type PayrollLine = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  monthlySalary: number;
  weeklyHours: number;
  periodStart: string;
  periodEnd: string;
  ordinaryDayHours: number;
  ordinaryNightHours: number;
  extraDayHours: number;
  extraNightHours: number;
  holidayHours: number;
  compensatoryDayOff: boolean;
  tardyMinutes: number;
  basePay: number;
  overtimePay: number;
  bonuses: number;
  adjustments: number;
  grossPay: number;
  isssDeduction: number;
  afpDeduction: number;
  incomeTaxDeduction: number;
  netPay: number;
  legalDeductions: boolean;
  status: string;
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
    </div>
  );
}
// Mediodía del negocio, no medianoche UTC: `new Date("2026-10-01")` es el 30 de
// septiembre en San Salvador y el encabezado del período salía con el mes
// anterior.
const periodLabel = (date: string) =>
  formatDate(`${date.slice(0, 10)}T12:00:00-06:00`, { month: "long", year: "numeric" });
const round = (value: number) => Math.round(value * 100) / 100;
function PrintReceipt({ line }: { line: PayrollLine }) {
  const printRef = useRef<PrintFrameHandle>(null);
  const expenses = line.isssDeduction + line.afpDeduction + line.incomeTaxDeduction;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg text-[10px]"
        onClick={() => printRef.current?.imprimir()}
      >
        <Printer className="size-3.5" /> Recibo
      </Button>
      <PrintFrame ref={printRef} familia="documento">
        <DocumentoA4
          emisor="Turno & Caja · Comercio local"
          titulo="COMPROBANTE DE LIQUIDACIÓN"
          numero={`PLAN-${line.id.slice(0, 8).toUpperCase()}`}
          fecha={line.periodEnd}
          destinatario={
            <div>
              <strong>Persona:</strong> {line.employeeName}
              <br />
              <strong>Puesto:</strong> {line.employeeRole}
              <br />
              <strong>Período:</strong> {periodLabel(line.periodStart)}
            </div>
          }
          lineas={[
            {
              descripcion: "Salario proporcional a horas ordinarias",
              cantidad: round(line.ordinaryDayHours + line.ordinaryNightHours),
              precioUnitario: 0,
              total: line.basePay,
            },
            {
              descripcion: "Horas extras diurnas y nocturnas",
              cantidad: round(line.extraDayHours + line.extraNightHours),
              precioUnitario: 0,
              total: line.overtimePay,
            },
            {
              descripcion: "Horas trabajadas en asueto o descanso",
              cantidad: line.holidayHours,
              precioUnitario: (line.monthlySalary / 240) * 2,
              total: (line.monthlySalary / 240) * 2 * line.holidayHours,
            },
            {
              descripcion: "Bonificaciones",
              cantidad: 1,
              precioUnitario: line.bonuses,
              total: line.bonuses,
            },
            {
              descripcion: "Ajustes",
              cantidad: 1,
              precioUnitario: line.adjustments,
              total: line.adjustments,
            },
          ]}
          subtotal={line.grossPay}
          extras={[
            { etiqueta: "ISSS (3%)", valor: -line.isssDeduction },
            { etiqueta: "AFP (7.25%)", valor: -line.afpDeduction },
            { etiqueta: "Renta", valor: -line.incomeTaxDeduction },
          ]}
          total={line.netPay}
          pie={
            <span>
              Jornada nocturna y horas extras según parámetros configurados. Recibo informativo
              sujeto a revisión patronal.
            </span>
          }
        />
      </PrintFrame>
    </>
  );
}
function EmployeeDialog({
  employee,
  onSaved,
  patterns,
  shifts,
  scheduleStartDate,
}: {
  employee?: Employee;
  onSaved: () => void;
  patterns: PatternOption[];
  shifts: ShiftOption[];
  scheduleStartDate: string;
}) {
  const [error, setError] = useState("");
  // Controlado: al guardar, el refresco de datos remonta el formulario y sin
  // esto el diálogo quedaba abierto con los campos vacíos.
  const [open, setOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState(employee?.scheduleType ?? "FIXED");
  const [patternId, setPatternId] = useState(employee?.schedulePatternId ?? patterns[0]?.id ?? "");
  const [anchorDate, setAnchorDate] = useState(employee?.scheduleAnchorDate ?? scheduleStartDate);
  const [rosterOverrides, setRosterOverrides] = useState<Record<string, string | null>>(
    Object.fromEntries(
      employee?.rosters
        .filter((entry) => entry.isOverride)
        .map((entry) => [entry.date, entry.shiftId]) ?? [],
    ),
  );
  const selectedPattern = patterns.find((pattern) => pattern.id === patternId);
  const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
  const preview =
    selectedPattern && isValidScheduleDate(anchorDate)
      ? Array.from({ length: selectedPattern.cycleDays }, (_, index) => {
          const date = new Date(
            Date.parse(`${scheduleStartDate}T00:00:00.000Z`) + index * 86_400_000,
          )
            .toISOString()
            .slice(0, 10);
          const dayOffset = Math.round(
            (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${anchorDate}T00:00:00.000Z`)) /
              86_400_000,
          );
          const cycleIndex =
            ((dayOffset % selectedPattern.cycleDays) + selectedPattern.cycleDays) %
            selectedPattern.cycleDays;
          const detail = selectedPattern.details.find(
            (entry) => entry.daySequence === cycleIndex + 1,
          );
          const shiftId = Object.hasOwn(rosterOverrides, date)
            ? rosterOverrides[date]
            : detail?.isRestDay
              ? null
              : (detail?.shiftId ?? null);
          return { date, shiftId, shift: shiftId ? shiftsById.get(shiftId) : undefined };
        })
      : [];
  const previewHours = preview.reduce(
    (sum, day) => sum + (day.shift ? shiftMetrics(day.shift).estimatedHours : 0),
    0,
  );
  const previewNightHours = preview.reduce((sum, day) => {
    if (!day.shift) return sum;
    const metrics = shiftMetrics(day.shift);
    return sum + (metrics.legalClass === "NIGHT" ? metrics.estimatedHours : 0);
  }, 0);
  const averageWeeklyHours = (previewHours / Math.max(1, preview.length)) * 7;
  const weeklyLimit =
    previewNightHours > 0 && previewNightHours >= previewHours - previewNightHours ? 39 : 44;
  const approachingLimit = averageWeeklyHours >= weeklyLimit * 0.9;
  const hasDailyLimit = preview.some(
    (day) =>
      day.shift && shiftMetrics(day.shift).estimatedHours > shiftMetrics(day.shift).dailyLimit,
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={employee ? "ghost" : "outline"}
          size={employee ? "icon" : "sm"}
          title={employee ? "Editar persona" : undefined}
          className={employee ? "size-8" : "rounded-xl bg-card"}
        >
          {employee ? (
            <UserRoundCog className="size-4" />
          ) : (
            <>
              <Plus className="size-4" /> Agregar persona
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "Editar persona" : "Agregar al equipo"}</DialogTitle>
          <DialogDescription>Datos de horario, salario y deducciones aplicables.</DialogDescription>
        </DialogHeader>
        <form
          action={async (form) => {
            try {
              await saveEmployee(form);
              setError("");
              setOpen(false);
              onSaved();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={employee?.id ?? ""} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre completo">
              <Input
                name="fullName"
                defaultValue={employee?.fullName}
                required
                placeholder="Nombre y apellido"
              />
            </Field>
            <Field label="Puesto">
              <Input
                name="role"
                defaultValue={employee?.role}
                required
                placeholder="Cajero, ventas…"
              />
            </Field>
          </div>
          <Field label="Correo de su cuenta (opcional)">
            <Input
              name="email"
              type="email"
              defaultValue={employee?.email ?? ""}
              placeholder="persona@correo.com"
            />
            <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
              Con este correo la persona ve solo su ficha: abre caja y marca asistencia por sí
              misma. Sin correo, únicamente el administrador puede operar su turno.
            </span>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Salario mensual (USD)">
              <Input
                name="monthlySalary"
                type="number"
                min="1"
                step="0.01"
                defaultValue={employee?.monthlySalary}
                required
              />
            </Field>
            <Field label={employee ? "Nuevo PIN (opcional)" : "PIN personal (4–6 dígitos)"}>
              <Input
                name="pin"
                type="password"
                inputMode="numeric"
                minLength={employee ? undefined : 4}
                maxLength={6}
                required={!employee}
                placeholder={employee ? "Déjalo vacío para conservarlo" : "PIN para marcajes"}
              />
            </Field>
          </div>
          <input type="hidden" name="scheduleType" value={scheduleType} />
          <div className="space-y-3 rounded-2xl border border-border p-3">
            <p className="text-xs font-semibold">Tipo de jornada</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de jornada">
              {[
                ["FIXED", "Horario fijo", "Mismo horario semanal"],
                ["ROTATING", "Rotativo / variable", "Ciclo con descansos y ajustes"],
              ].map(([value, title, description]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scheduleType === value}
                  onClick={() => setScheduleType(value)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    scheduleType === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="block text-xs font-semibold">{title}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {description}
                  </span>
                </button>
              ))}
            </div>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-200 ease-in-out"
              style={{
                gridTemplateRows: scheduleType === "FIXED" ? "1fr" : "0fr",
                opacity: scheduleType === "FIXED" ? 1 : 0,
              }}
              aria-hidden={scheduleType !== "FIXED"}
            >
              <fieldset disabled={scheduleType !== "FIXED"} className="min-h-0 overflow-hidden">
                <div className="grid gap-3 pt-1 sm:grid-cols-3">
                  <Field label="Entrada">
                    <Input
                      name="scheduledStart"
                      type="time"
                      defaultValue={employee?.scheduledStart ?? "08:00"}
                      required
                    />
                  </Field>
                  <Field label="Salida">
                    <Input
                      name="scheduledEnd"
                      type="time"
                      defaultValue={employee?.scheduledEnd ?? "17:00"}
                      required
                    />
                  </Field>
                  <Field label="Horas por semana">
                    <Input
                      name="weeklyHours"
                      type="number"
                      min="1"
                      max="60"
                      step="0.5"
                      defaultValue={employee?.weeklyHours ?? 44}
                      required
                    />
                  </Field>
                </div>
              </fieldset>
            </div>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-200 ease-in-out"
              style={{
                gridTemplateRows: scheduleType === "ROTATING" ? "1fr" : "0fr",
                opacity: scheduleType === "ROTATING" ? 1 : 0,
              }}
              aria-hidden={scheduleType !== "ROTATING"}
            >
              <fieldset disabled={scheduleType !== "ROTATING"} className="min-h-0 overflow-hidden">
                <input type="hidden" name="schedulePatternId" value={patternId} />
                <input type="hidden" name="scheduleAnchorDate" value={anchorDate} />
                <input
                  type="hidden"
                  name="rosterOverrides"
                  value={JSON.stringify(rosterOverrides)}
                />
                <div className="space-y-3 pt-1">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Plantilla de ciclo">
                      <Select value={patternId} onValueChange={setPatternId}>
                        <SelectTrigger aria-label="Plantilla de turno base">
                          <SelectValue placeholder="Elige una plantilla" />
                        </SelectTrigger>
                        <SelectContent>
                          {patterns.map((pattern) => (
                            <SelectItem key={pattern.id} value={pattern.id}>
                              {pattern.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Fecha de inicio del ciclo">
                      <Input
                        type="date"
                        value={anchorDate}
                        onChange={(event) => setAnchorDate(event.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  {preview.length ? (
                    <>
                      <div className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Vista previa del ciclo</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Puedes ajustar fechas puntuales sin cambiar la plantilla base.
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums">
                            {averageWeeklyHours.toFixed(1)} h/sem
                          </p>
                          <p
                            className={`text-[10px] font-medium ${approachingLimit || hasDailyLimit ? "text-amber-700" : "text-emerald-700"}`}
                          >
                            {hasDailyLimit
                              ? "Supera el máximo diario"
                              : approachingLimit
                                ? "Cerca del límite"
                                : "Dentro del límite"}{" "}
                            · {weeklyLimit} h máximas
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {preview.map(({ date, shift }) => (
                          <div key={date} className="space-y-1.5 rounded-xl border p-2.5">
                            <p className="text-[10px] font-semibold capitalize text-muted-foreground">
                              {new Intl.DateTimeFormat("es-SV", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                timeZone: "UTC",
                              }).format(new Date(`${date}T12:00:00Z`))}
                            </p>
                            <p className="truncate text-xs font-semibold">
                              {shift?.name ?? "DESCANSO"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {shift
                                ? `${shift.startTime}–${shift.endTime} · ${shiftMetrics(shift).estimatedHours} h netas`
                                : "Sin jornada asignada"}
                            </p>
                            <Select
                              value={
                                Object.hasOwn(rosterOverrides, date)
                                  ? (rosterOverrides[date] ?? "__REST__")
                                  : "__PATTERN__"
                              }
                              onValueChange={(value) =>
                                setRosterOverrides((current) => {
                                  const next = { ...current };
                                  if (value === "__PATTERN__") delete next[date];
                                  else next[date] = value === "__REST__" ? null : value;
                                  return next;
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label={`Ajuste de turno para ${date}`}
                                className="h-8 text-[10px]"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__PATTERN__">Usar patrón</SelectItem>
                                <SelectItem value="__REST__">Marcar descanso</SelectItem>
                                {shifts.map((option) => (
                                  <SelectItem key={option.id} value={option.id}>
                                    {option.name} · {option.startTime}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
                      No hay plantillas activas. Ejecuta la migración de jornadas rotativas para
                      cargar los ciclos base.
                    </p>
                  )}
                </div>
              </fieldset>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <Checkbox
              name="applyLegalDeductions"
              value="on"
              defaultChecked={employee?.applyLegalDeductions ?? true}
            />
            <span>
              <span className="block text-xs font-semibold">Aplicar deducciones de ley</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                ISSS, AFP y renta se calculan para esta persona cuando se activa.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <Checkbox name="active" value="on" defaultChecked={employee?.active ?? true} />
            <span className="text-xs font-semibold">Persona activa</span>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full rounded-xl">
            {employee ? "Guardar cambios" : "Agregar al equipo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function PayrollWorkspace({
  employees,
  lines,
  month,
  patterns,
  shifts,
  scheduleStartDate,
}: {
  employees: Employee[];
  lines: PayrollLine[];
  month: string;
  patterns: PatternOption[];
  shifts: ShiftOption[];
  scheduleStartDate: string;
}) {
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [edit, setEdit] = useState<PayrollLine | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");
  const activeEmployees = employees.filter((employee) => employee.active);
  const thisPeriod = lines.filter((line) => line.periodStart.slice(0, 7) === selectedMonth);
  const currentTotal = thisPeriod.reduce((sum, line) => sum + line.netPay, 0);
  const pending = thisPeriod.filter((line) => line.status !== "PAID").length;
  const disabledDeductions = activeEmployees.filter(
    (employee) => !employee.applyLegalDeductions,
  ).length;
  const employeeDelete = async (form: FormData) => {
    await deleteEmployee(form);
  };
  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Resumen de pago</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Planilla del equipo</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Horas ordinarias y extras, descuentos legales por persona y neto a pagar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Label
              htmlFor="payroll-month"
              className="text-[10px] font-semibold text-muted-foreground"
            >
              Período
            </Label>
            <input
              id="payroll-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-[118px] bg-transparent text-xs font-semibold outline-none"
            />
          </div>
          <form
            action={async (form) => {
              form.set("month", selectedMonth);
              await generatePayroll(form);
            }}
          >
            <input type="hidden" name="month" value={selectedMonth} />
            <Button className="h-10 rounded-xl">
              <Calculator className="size-4" /> Calcular período
            </Button>
          </form>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="surface-card border-border/80">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Neto del período</span>
              <CircleDollarSign className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-display text-[26px] font-bold">{formatMoney(currentTotal)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{thisPeriod.length} liquidaciones</p>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/80">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Personas activas</span>
              <UsersRound className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-display text-[26px] font-bold">{activeEmployees.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Con salario y horario configurados</p>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/80">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Por confirmar</span>
              <FileDown className="size-4 text-amber-700" />
            </div>
            <p className="mt-4 font-display text-[26px] font-bold">{pending}</p>
            <p className="mt-1 text-xs text-muted-foreground">Revisión antes del desembolso</p>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/80">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Sin descuentos de ley</span>
              <ShieldCheck className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-display text-[26px] font-bold">{disabledDeductions}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Configuración individual por persona
            </p>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="surface-card overflow-hidden border-border/80">
          <CardContent className="p-0">
            <div className="flex flex-col justify-between gap-3 border-b border-border/70 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
              <div>
                <p className="eyebrow">Liquidaciones</p>
                <h2 className="mt-1 font-display text-lg font-bold">
                  {periodLabel(thisPeriod[0]?.periodStart ?? `${selectedMonth}-01`)}
                </h2>
              </div>
              <Badge variant="secondary" className="w-fit text-[10px]">
                {thisPeriod.length} personas · USD
              </Badge>
            </div>
            <div className="hidden grid-cols-[1.2fr_0.9fr_0.8fr_0.95fr_0.7fr_130px] gap-2 border-b border-border/70 bg-muted/40 px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-muted-foreground xl:grid">
              <span>Persona</span>
              <span>Horas normales</span>
              <span>Extras</span>
              <span>Deducciones</span>
              <span>Neto</span>
              <span>Acciones</span>
            </div>
            <div className="divide-y divide-border/70">
              {thisPeriod.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-3 px-4 py-4 sm:px-5 xl:grid-cols-[1.2fr_0.9fr_0.8fr_0.95fr_0.7fr_130px] xl:items-center"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-primary">
                      {line.employeeName
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{line.employeeName}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {line.employeeRole} · {formatMoney(line.monthlySalary)}/mes
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] xl:block">
                    <span className="text-muted-foreground xl:hidden">Ordinarias</span>
                    <span className="font-semibold tabular-nums">
                      {round(line.ordinaryDayHours + line.ordinaryNightHours)} h{" "}
                      <span className="font-normal text-muted-foreground">
                        ({round(line.ordinaryNightHours)} noct.)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] xl:block">
                    <span className="text-muted-foreground xl:hidden">Horas extras</span>
                    <span className="font-semibold tabular-nums">
                      {round(line.extraDayHours + line.extraNightHours)} h{" "}
                      <span className="font-normal text-muted-foreground">
                        ({round(line.extraNightHours)} noct.) · asueto {round(line.holidayHours)} h
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] xl:block">
                    <span className="text-muted-foreground xl:hidden">ISSS · AFP · renta</span>
                    <span className="font-semibold">
                      {formatMoney(
                        line.isssDeduction + line.afpDeduction + line.incomeTaxDeduction,
                      )}
                    </span>
                    <span className="ml-1 text-muted-foreground">
                      {line.legalDeductions ? "con ley" : "omitidas"}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-2 xl:block xl:border-0 xl:pt-0">
                    <span className="text-[10px] text-muted-foreground xl:hidden">
                      Neto a pagar
                    </span>
                    <span className="font-display text-sm font-bold text-primary">
                      {formatMoney(line.netPay)}
                    </span>
                    <Badge
                      variant={line.status === "PAID" ? "secondary" : "outline"}
                      className={`ml-1 text-[8px] ${line.status === "PAID" ? "bg-emerald-100 text-emerald-800" : ""}`}
                    >
                      {line.status === "PAID" ? "Pagada" : "Borrador"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <PrintReceipt line={line} />
                    <Dialog
                      open={editOpen && edit?.id === line.id}
                      onOpenChange={(open) => {
                        setEditOpen(open);
                        if (open) setEdit(line);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar liquidación"
                          className="size-8"
                        >
                          <FileText className="size-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Ajustar liquidación</DialogTitle>
                          <DialogDescription>
                            {line.employeeName} · {periodLabel(line.periodStart)}
                          </DialogDescription>
                        </DialogHeader>
                        {edit && (
                          <form
                            action={async (form) => {
                              try {
                                setEditOpen(false);
                                await updatePayroll(form);
                                setError("");
                              } catch (cause) {
                                setError(
                                  cause instanceof Error ? cause.message : "No se pudo guardar.",
                                );
                              }
                            }}
                            className="space-y-4"
                          >
                            <input type="hidden" name="id" value={edit.id} />
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Bonificaciones">
                                <Input
                                  name="bonuses"
                                  type="number"
                                  step="0.01"
                                  defaultValue={edit.bonuses}
                                />
                              </Field>
                              <Field label="Ajuste (+/−)">
                                <Input
                                  name="adjustments"
                                  type="number"
                                  step="0.01"
                                  defaultValue={edit.adjustments}
                                />
                              </Field>
                              <Field label="Horas en asueto">
                                <Input
                                  name="holidayHours"
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  defaultValue={edit.holidayHours}
                                />
                              </Field>
                            </div>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                              <Checkbox
                                name="compensatoryDayOff"
                                value="on"
                                defaultChecked={edit.compensatoryDayOff}
                              />
                              <span>
                                <span className="block text-xs font-semibold">
                                  Registrar día compensatorio
                                </span>
                                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                  Señala si corresponde otorgarlo por trabajo en descanso o asueto.
                                </span>
                              </span>
                            </label>
                            <Field label="Estado">
                              <select
                                name="status"
                                defaultValue={edit.status}
                                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                              >
                                <option value="DRAFT">Borrador</option>
                                <option value="PAID">Pagada</option>
                              </select>
                            </Field>
                            <div className="rounded-xl bg-muted/55 p-3 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Bruto calculado</span>
                                <b>{formatMoney(edit.grossPay)}</b>
                              </div>
                              <div className="mt-1 flex justify-between">
                                <span className="text-muted-foreground">Neto actual</span>
                                <b className="text-primary">{formatMoney(edit.netPay)}</b>
                              </div>
                            </div>
                            {error && <p className="text-xs text-destructive">{error}</p>}
                            <div className="flex gap-2">
                              <Button className="flex-1 rounded-xl">Guardar liquidación</Button>
                              <Button
                                formAction={deletePayroll}
                                formNoValidate
                                name="id"
                                value={edit.id}
                                variant="destructive"
                                size="icon"
                                title="Eliminar liquidación"
                                className="size-10"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </form>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              ))}
              {thisPeriod.length === 0 && (
                <div className="px-5 py-12 text-center">
                  <span className="mx-auto grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                    <Calculator className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">
                    Todavía no hay liquidaciones para este mes
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Calcula el período para tomar los marcajes y preparar un borrador por persona.
                  </p>
                  <form
                    action={async (form) => {
                      form.set("month", selectedMonth);
                      await generatePayroll(form);
                    }}
                  >
                    <input type="hidden" name="month" value={selectedMonth} />
                    <Button className="mt-4 rounded-xl">
                      Calcular este período <ArrowRight className="size-4" />
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/80">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-5">
              <div>
                <p className="eyebrow">Equipo</p>
                <h2 className="mt-1 font-display text-lg font-bold">Personas y condiciones</h2>
              </div>
              <EmployeeDialog
                onSaved={() => undefined}
                patterns={patterns}
                shifts={shifts}
                scheduleStartDate={scheduleStartDate}
              />
            </div>
            <div className="divide-y divide-border/70">
              {employees.map((employee) => (
                <div key={employee.id} className="flex items-center gap-2.5 px-4 py-3.5 sm:px-5">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${employee.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    <UsersRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{employee.fullName}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {employee.role} · {formatMoney(employee.monthlySalary)}/mes
                    </p>
                  </div>
                  <Badge variant="outline" className="hidden text-[9px] sm:inline-flex">
                    {employee.applyLegalDeductions ? "Deducciones activas" : "Sin deducciones"}
                  </Badge>
                  <EmployeeDialog
                    employee={employee}
                    onSaved={() => undefined}
                    patterns={patterns}
                    shifts={shifts}
                    scheduleStartDate={scheduleStartDate}
                  />
                  <form action={employeeDelete}>
                    <input type="hidden" name="id" value={employee.id} />
                    <Button
                      variant="ghost"
                      size="icon"
                      title={employee.active ? "Desactivar persona" : "Eliminar persona"}
                      className="size-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </div>
              ))}
              {employees.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Agrega a tu equipo para comenzar.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border/80 bg-card/80 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <BadgeCheck className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold">Cálculo de referencia legal</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                La renta aplica la tabla mensual del Decreto Ejecutivo 10 (vigente desde mayo de
                2025), después de cotizaciones. ISSS: 3% con base máxima de $1,000; AFP: 7.25%.
                Confirma el tratamiento aplicable antes de pagar.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/75 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <ArrowDown className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-amber-950">Horas extras y nocturnidad</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900/75">
                La jornada nocturna ordinaria suma 25%; la extra diurna aplica 2× y la nocturna 2.5×
                según el ejemplo del MTPS. El trabajo en asueto se estima a 2×. Límites
                configurados: 8/44 h diurnas y 7/39 h nocturnas.
              </p>
              <p className="mt-2 text-[10px] font-medium text-amber-900">
                Este cálculo ayuda a preparar la planilla; revisa jornadas especiales, asuetos y
                compensatorios con asesoría laboral.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
