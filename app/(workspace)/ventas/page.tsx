import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Boxes, CircleAlert, Package, ShoppingCart, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export const dynamic = "force-dynamic";
function salvadorMidnight() {
  const offset = 6 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() - offset);
  localNow.setUTCHours(0, 0, 0, 0);
  return new Date(localNow.getTime() + offset);
}
export default async function HomePage() {
  const startOfDay = salvadorMidnight();
  const [productCount, lowStock, salesToday, categories, recentSales] = await Promise.all([
    db.producto.count({ where: { isActive: true } }),
    db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM productos WHERE current_stock <= min_stock`,
    db.venta.aggregate({ where: { soldAt: { gte: startOfDay }, status: "completada" }, _count: { _all: true }, _sum: { total: true } }),
    db.categoria.findMany({ orderBy: { totalRevenue: "desc" }, take: 5, select: { id: true, categoryName: true, itemsSold: true, totalRevenue: true } }),
    db.venta.findMany({ orderBy: { soldAt: "desc" }, take: 5, include: { lines: { select: { quantity: true } } } }),
  ]);
  const todayTotal = Number(salesToday._sum.total ?? 0);
  const topRevenue = Math.max(1, ...categories.map((category) => Number(category.totalRevenue)));
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-8 text-primary-foreground shadow-lg sm:px-9 sm:py-10">
        <div className="absolute -right-12 -top-20 size-72 rounded-full border border-white/10" /><div className="absolute -right-2 -top-10 size-52 rounded-full border border-white/10" />
        <div className="relative max-w-2xl"><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70"><Sparkles className="size-4" /> Todo en orden, un paso a la vez</p><h1 className="display-heading text-4xl font-semibold leading-tight sm:text-5xl">Tu negocio, más claro.<br /><span className="text-white/75">Tu día, más fácil.</span></h1><p className="mt-4 max-w-lg text-sm leading-6 text-white/75 sm:text-base">Consulta tus productos, registra una venta y mantén tus existencias al día desde un solo lugar.</p><div className="mt-6 flex flex-wrap gap-3"><Button asChild size="lg" className="h-12 rounded-xl bg-white px-5 font-bold text-primary hover:bg-white/90"><Link href="/ventas">Abrir punto de venta<ShoppingCart /></Link></Button><Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"><Link href="/inventario">Ver inventario<Package /></Link></Button></div></div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Ventas de hoy" value={formatMoney(todayTotal)} note={`${salesToday._count._all} ${salesToday._count._all === 1 ? "venta registrada" : "ventas registradas"}`} icon={ShoppingCart} tone="green" />
        <MetricCard label="Productos activos" value={productCount.toLocaleString("es-SV")} note="Artículos en tu catálogo" icon={Package} tone="neutral" />
        <MetricCard label="Por reponer" value={Number(lowStock[0]?.count ?? 0).toLocaleString("es-SV")} note="En mínimo o por debajo" icon={CircleAlert} tone="amber" />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="panel-shadow border-border/80">
          <CardHeader className="flex flex-row items-end justify-between space-y-0"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Datos de tus planillas</p><CardTitle className="display-heading mt-1 text-2xl">Categorías destacadas</CardTitle></div><span className="text-xs text-muted-foreground">Desempeño histórico</span></CardHeader>
          <CardContent className="space-y-5">{categories.map((category, index) => {
            const revenue = Number(category.totalRevenue);
            const width = Math.max(5, revenue / topRevenue * 100);
            return <div key={category.id} className="space-y-2"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{category.categoryName}</p><p className="text-xs text-muted-foreground">{category.itemsSold} artículos vendidos</p></div><span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(revenue)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${index === 0 ? "bg-primary" : index === 1 ? "bg-amber-400" : "bg-emerald-300"}`} style={{ width: `${width}%` }} /></div></div>;
          })}{categories.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Tus categorías aparecerán aquí al cargar el inventario.</p>}</CardContent>
        </Card>
        <Card className="panel-shadow border-border/80">
          <CardHeader className="flex flex-row items-end justify-between space-y-0"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Actividad</p><CardTitle className="display-heading mt-1 text-2xl">Ventas recientes</CardTitle></div><Button asChild variant="ghost" size="sm"><Link href="/ventas">Ver punto de venta<ArrowUpRight /></Link></Button></CardHeader>
          <CardContent>{recentSales.length ? <div className="divide-y">{recentSales.map((sale) => <div key={sale.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold">Venta #{sale.number}</p><p className="text-xs text-muted-foreground">{formatDateTime(sale.soldAt)} · {sale.lines.reduce((sum, line) => sum + line.quantity, 0)} artículos</p></div><div className="text-right"><p className="font-bold">{formatMoney(Number(sale.total))}</p><Badge variant={sale.status === "completada" ? "secondary" : "outline"}>{sale.status === "completada" ? "Completada" : "Anulada"}</Badge></div></div>)}</div> : <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/25 px-6 text-center"><span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Boxes className="size-5" /></span><p className="font-semibold">Tu primera venta está a un toque</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Registra una venta y el inventario se actualizará automáticamente.</p><Button asChild className="mt-4 rounded-xl"><Link href="/ventas">Registrar venta<ShoppingCart /></Link></Button></div>}</CardContent>
        </Card>
      </section>
      <Card className="border-amber-200 bg-amber-50/55"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><ArrowDownRight className="size-5" /></span><div><p className="font-semibold text-amber-950">El inventario se mueve con cada operación</p><p className="text-sm text-amber-900/75">Las ventas descuentan unidades y cada ajuste queda registrado con su motivo.</p></div></div><Link href="/inventario" prefetch={false} className="whitespace-nowrap text-sm font-bold text-primary">Revisar existencias →</Link></CardContent></Card>
    </div>
  );
}
function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Package; tone: "green" | "neutral" | "amber" }) {
  const iconClass = tone === "green" ? "bg-secondary text-primary" : tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-muted text-foreground";
  return <Card className="panel-shadow border-border/80"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className={`flex size-12 items-center justify-center rounded-2xl ${iconClass}`}><Icon className="size-5" /></span></CardContent></Card>;
}
