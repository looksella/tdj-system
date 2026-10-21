import { BarChart3, CircleAlert, Package, ShoppingBag, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/locale";
export const dynamic = "force-dynamic";
const DAYS_TO_REVIEW = 30;
export default async function ReportsPage() {
  const since = new Date(Date.now() - DAYS_TO_REVIEW * 24 * 60 * 60 * 1000);
  const [sales, saleLines, lowStock, inventory, categoryPerformance] = await Promise.all([
    db.venta.findMany({
      where: { status: "completada", soldAt: { gte: since } },
      orderBy: { soldAt: "desc" },
      take: 12,
      include: { lines: { select: { quantity: true } } },
    }),
    db.lineaVenta.findMany({
      where: { sale: { status: "completada", soldAt: { gte: since } } },
      select: { quantity: true, lineTotal: true, product: { select: { id: true, name: true, category: { select: { categoryName: true } } } } },
    }),
    db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM productos WHERE is_active = true AND current_stock <= min_stock`,
    db.producto.aggregate({ where: { isActive: true }, _count: { _all: true }, _sum: { currentStock: true } }),
    db.categoria.findMany({ orderBy: { totalRevenue: "desc" }, take: 6, select: { id: true, categoryName: true, itemsSold: true, totalQuantitySold: true, totalRevenue: true } }),
  ]);
  const totalSales = sales.reduce((total, sale) => total + sale.total.toNumber(), 0);
  const unitsSold = saleLines.reduce((total, line) => total + line.quantity, 0);
  const productsById = new Map<string, { name: string; category: string; quantity: number; revenue: number }>();
  const categories = new Map<string, { quantity: number; revenue: number }>();
  for (const line of saleLines) {
    const currentProduct = productsById.get(line.product.id) ?? { name: line.product.name, category: line.product.category?.categoryName ?? "Sin categoría", quantity: 0, revenue: 0 };
    currentProduct.quantity += line.quantity;
    currentProduct.revenue += line.lineTotal.toNumber();
    productsById.set(line.product.id, currentProduct);
    const currentCategory = categories.get(currentProduct.category) ?? { quantity: 0, revenue: 0 };
    currentCategory.quantity += line.quantity;
    currentCategory.revenue += line.lineTotal.toNumber();
    categories.set(currentProduct.category, currentCategory);
  }
  const topProducts = [...productsById.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 8);
  const categorySales = [...categories.entries()].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const topCategoryRevenue = Math.max(1, ...categorySales.map((category) => category.revenue));
  return (
    <div className="space-y-7">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Información para decidir</p>
        <h1 className="display-heading text-4xl font-semibold sm:text-5xl">Reportes</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Consulta cómo se movió el negocio en los últimos 30 días y detecta qué conviene reponer.</p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ventas registradas" value={sales.length.toLocaleString("es-SV")} note="Últimos 30 días" icon={ShoppingBag} tone="green" />
        <MetricCard label="Ingresos del período" value={formatMoney(totalSales)} note={`${unitsSold.toLocaleString("es-SV")} unidades vendidas`} icon={TrendingUp} tone="amber" />
        <MetricCard label="Productos activos" value={(inventory._count._all ?? 0).toLocaleString("es-SV")} note={`${(inventory._sum.currentStock ?? 0).toLocaleString("es-SV")} unidades disponibles`} icon={Package} tone="neutral" />
        <MetricCard label="Por reponer" value={Number(lowStock[0]?.count ?? 0).toLocaleString("es-SV")} note="En mínimo o por debajo" icon={CircleAlert} tone="red" />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="panel-shadow border-border/80">
          <CardHeader><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Ventas actuales</p><CardTitle className="display-heading mt-1 text-2xl">Categorías con más movimiento</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {categorySales.length ? categorySales.map((category, index) => <div key={category.name} className="space-y-2"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{category.name}</p><p className="text-xs text-muted-foreground">{category.quantity.toLocaleString("es-SV")} unidades vendidas</p></div><span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(category.revenue)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={index === 0 ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-emerald-300"} style={{ width: `${Math.max(5, category.revenue / topCategoryRevenue * 100)}%` }} /></div></div>) : <EmptyReport text="Las categorías aparecerán cuando registres ventas." />}
          </CardContent>
        </Card>
        <Card className="panel-shadow border-border/80">
          <CardHeader><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Datos cargados</p><CardTitle className="display-heading mt-1 text-2xl">Rendimiento histórico por categoría</CardTitle></CardHeader>
          <CardContent className="space-y-4">{categoryPerformance.length ? categoryPerformance.map((category) => <div key={category.id} className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-semibold">{category.categoryName}</p><p className="text-xs text-muted-foreground">{category.totalQuantitySold.toLocaleString("es-SV")} unidades · {category.itemsSold} artículos</p></div><span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(category.totalRevenue.toNumber())}</span></div>) : <EmptyReport text="Carga el inventario para ver el historial por categoría." />}</CardContent>
        </Card>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="panel-shadow overflow-hidden border-border/80">
          <CardHeader><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Últimos 30 días</p><CardTitle className="display-heading mt-1 text-2xl">Productos con más salida</CardTitle></CardHeader>
          <CardContent className="p-0">{topProducts.length ? <Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Categoría</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Ventas</TableHead></TableRow></TableHeader><TableBody>{topProducts.map((product) => <TableRow key={product.name}><TableCell className="font-semibold">{product.name}</TableCell><TableCell className="text-muted-foreground">{product.category}</TableCell><TableCell className="text-right tabular-nums">{product.quantity.toLocaleString("es-SV")}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatMoney(product.revenue)}</TableCell></TableRow>)}</TableBody></Table> : <div className="p-6"><EmptyReport text="Aquí verás los productos con más salida al registrar ventas." /></div>}</CardContent>
        </Card>
        <Card className="panel-shadow overflow-hidden border-border/80">
          <CardHeader><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Actividad reciente</p><CardTitle className="display-heading mt-1 text-2xl">Últimas ventas</CardTitle></CardHeader>
          <CardContent className="p-0">{sales.length ? <div className="divide-y">{sales.map((sale) => <div key={sale.id} className="flex items-center justify-between gap-3 px-6 py-4"><div><p className="font-semibold">Venta #{sale.number}</p><p className="text-xs text-muted-foreground">{formatDate(sale.soldAt)} · {sale.lines.reduce((total, line) => total + line.quantity, 0)} artículos</p></div><div className="text-right"><p className="font-bold tabular-nums">{formatMoney(sale.total.toNumber())}</p><Badge variant="secondary">Completada</Badge></div></div>)}</div> : <div className="p-6"><EmptyReport text="Las ventas que registres aparecerán aquí." /></div>}</CardContent>
        </Card>
      </section>
    </div>
  );
}
function EmptyReport({ text }: { text: string }) {
  return <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/25 px-5 text-center"><BarChart3 className="mb-3 size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{text}</p></div>;
}
function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Package; tone: "green" | "amber" | "neutral" | "red" }) {
  const iconClass = tone === "green" ? "bg-secondary text-primary" : tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "red" ? "bg-red-100 text-red-700" : "bg-muted text-foreground";
  return <Card className="panel-shadow border-border/80"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}><Icon className="size-5" /></span></CardContent></Card>;
}
