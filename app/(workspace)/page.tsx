import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CircleAlert,
  Package,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/locale";
import { requirePagePermission } from "@/lib/require-page-permission";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePagePermission("dashboard:read");
  const offset = 6 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() - offset);
  localNow.setUTCHours(0, 0, 0, 0);
  const startOfDay = new Date(localNow.getTime() + offset);
  const [productCount, lowStock, salesToday, categories, recentSales] = await Promise.all([
    db.producto.count({ where: { isActive: true } }),
    db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM productos WHERE is_active = true AND current_stock <= min_stock`,
    db.venta.aggregate({
      where: {
        soldAt: { gte: startOfDay },
        status: "completada",
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.categoria.findMany({
      orderBy: { totalRevenue: "desc" },
      take: 5,
      select: { id: true, categoryName: true, itemsSold: true, totalRevenue: true },
    }),
    db.venta.findMany({
      orderBy: { soldAt: "desc" },
      take: 5,
      include: { lines: { select: { quantity: true } } },
    }),
  ]);
  const topRevenue = Math.max(1, ...categories.map((category) => Number(category.totalRevenue)));

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-primary px-6 py-8 text-primary-foreground shadow-lg sm:px-9 sm:py-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
          Tienda Don Juan
        </p>
        <h1 className="display-heading mt-3 text-4xl font-semibold sm:text-5xl">
          Tu negocio, más claro. Tu día, más fácil.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-white/75 sm:text-base">
          Consulta tus productos, registra una venta y mantén tus existencias al día.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="h-12 rounded-xl bg-white px-5 font-bold text-primary hover:bg-white/90">
            <Link href="/ventas">Abrir punto de venta <ShoppingCart /></Link>
          </Button>
          <Button asChild variant="outline" className="h-12 rounded-xl border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white">
            <Link href="/inventario">Ver inventario <Package /></Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Ventas de hoy" value={formatMoney(Number(salesToday._sum.total ?? 0))} detail={`${salesToday._count._all} ${salesToday._count._all === 1 ? "venta registrada" : "ventas registradas"}`} />
        <MetricCard label="Productos activos" value={productCount.toLocaleString("es-SV")} detail="En el catálogo" />
        <MetricCard label="Por reponer" value={Number(lowStock[0]?.count ?? 0).toLocaleString("es-SV")} detail="En mínimo o por debajo" alert />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="panel-shadow border-border/80">
          <CardHeader className="flex flex-row items-end justify-between space-y-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Datos del negocio</p>
              <CardTitle className="display-heading mt-1 text-2xl">Categorías destacadas</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">Desempeño histórico</span>
          </CardHeader>
          <CardContent className="space-y-5">
            {categories.map((category, index) => {
              const revenue = Number(category.totalRevenue);
              const width = Math.max(5, (revenue / topRevenue) * 100);
              return (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{category.categoryName}</p>
                      <p className="text-xs text-muted-foreground">{category.itemsSold} artículos vendidos</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(revenue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${index === 0 ? "bg-primary" : index === 1 ? "bg-amber-400" : "bg-emerald-300"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {categories.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Tus categorías aparecerán aquí al cargar el inventario.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="panel-shadow border-border/80">
          <CardHeader className="flex flex-row items-end justify-between space-y-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Actividad</p>
              <CardTitle className="display-heading mt-1 text-2xl">Ventas recientes</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/ventas">Ver punto de venta <ArrowUpRight /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentSales.length ? (
              <div className="divide-y">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold">Venta #{sale.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(sale.soldAt)} · {sale.lines.reduce((sum, line) => sum + line.quantity, 0)} artículos
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatMoney(Number(sale.total))}</p>
                      <Badge variant={sale.status === "completada" ? "secondary" : "outline"}>
                        {sale.status === "completada" ? "Completada" : "Anulada"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/25 px-6 text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <Boxes className="size-5" />
                </span>
                <p className="font-semibold">Tu primera venta está a un toque</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Registra una venta y el inventario se actualizará automáticamente.
                </p>
                <Button asChild className="mt-4 rounded-xl">
                  <Link href="/ventas">Registrar venta <ShoppingCart /></Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      <Card className="border-amber-200 bg-amber-50/55">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <ArrowDownRight className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-amber-950">El inventario se mueve con cada operación</p>
              <p className="text-sm text-amber-900/75">
                Las ventas descuentan unidades y cada ajuste queda registrado con su motivo.
              </p>
            </div>
          </div>
          <Link href="/inventario" prefetch={false} className="whitespace-nowrap text-sm font-bold text-primary">
            Revisar existencias →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  const Icon = alert ? CircleAlert : label === "Ventas de hoy" ? ShoppingCart : Package;
  const tone = alert ? "bg-amber-100 text-amber-800" : "bg-secondary text-primary";
  return (
    <Card className="panel-shadow border-border/80">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className={`flex size-11 items-center justify-center rounded-2xl ${tone}`}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
