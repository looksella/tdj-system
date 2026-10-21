import { ClipboardList, PackagePlus, ShoppingBag } from "lucide-react";
import { PurchaseDialog } from "@/components/purchases/purchase-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/locale";
export const dynamic = "force-dynamic";
export default async function PurchasesPage() {
  const [purchases, products] = await Promise.all([
    db.compra.findMany({ orderBy: { purchasedAt: "desc" }, take: 50, include: { lines: { include: { product: { select: { name: true, sku: true } } } } } }),
    db.producto.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 1200, select: { id: true, sku: true, name: true, purchasePrice: true } }),
  ]);
  const totalPurchased = purchases.reduce((sum, purchase) => sum + purchase.total.toNumber(), 0);
  const totalUnits = purchases.reduce((sum, purchase) => sum + purchase.lines.reduce((subtotal, line) => subtotal + line.quantity, 0), 0);
  const productOptions = products.map((product) => ({ ...product, purchasePrice: product.purchasePrice.toString() }));
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Reposición y entradas</p><h1 className="display-heading text-4xl font-semibold sm:text-5xl">Compras y abastecimiento</h1><p className="mt-2 max-w-2xl text-muted-foreground">Registra lo que recibes, conserva el historial y actualiza existencias en un solo paso.</p></div>
        <PurchaseDialog products={productOptions} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="panel-shadow border-border/80"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ClipboardList className="size-5" /></span><div><p className="text-sm text-muted-foreground">Compras registradas</p><p className="mt-1 text-2xl font-bold tabular-nums">{purchases.length}</p></div></CardContent></Card>
        <Card className="panel-shadow border-border/80"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary"><PackagePlus className="size-5" /></span><div><p className="text-sm text-muted-foreground">Unidades recibidas</p><p className="mt-1 text-2xl font-bold tabular-nums">{totalUnits.toLocaleString("es-SV")}</p></div></CardContent></Card>
        <Card className="panel-shadow border-border/80"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><ShoppingBag className="size-5" /></span><div><p className="text-sm text-muted-foreground">Total de compras</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(totalPurchased)}</p></div></CardContent></Card>
      </div>
      <Card className="panel-shadow overflow-hidden border-border/80">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Historial de compras</h2><p className="mt-1 text-sm text-muted-foreground">Las últimas 50 recepciones quedan listas para consultar o corregir.</p></div><Badge variant="secondary">{purchases.length} registradas</Badge></div>
          {purchases.length ? <Table><TableHeader><TableRow><TableHead>Compra</TableHead><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Productos</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="w-12"><span className="sr-only">Editar</span></TableHead></TableRow></TableHeader><TableBody>{purchases.map((purchase) => {
            const editable = { id: purchase.id, supplierName: purchase.supplierName, reference: purchase.reference, note: purchase.note, purchasedAt: purchase.purchasedAt.toISOString(), lines: purchase.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCost: line.unitCost.toString() })) };
            return <TableRow key={purchase.id}><TableCell className="font-semibold">C-{purchase.number}</TableCell><TableCell>{formatDate(purchase.purchasedAt)}</TableCell><TableCell><p className="font-medium">{purchase.supplierName}</p>{purchase.reference ? <p className="text-xs text-muted-foreground">{purchase.reference}</p> : null}</TableCell><TableCell className="max-w-80"><p className="truncate text-sm">{purchase.lines.map((line) => `${line.quantity} × ${line.product.name}`).join(", ")}</p></TableCell><TableCell className="text-right font-semibold tabular-nums">{formatMoney(purchase.total.toNumber())}</TableCell><TableCell><PurchaseDialog products={productOptions} purchase={editable} /></TableCell></TableRow>;
          })}</TableBody></Table> : <div className="px-6 py-14 text-center"><ShoppingBag className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-4 font-semibold">Aún no registras compras</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Registra la primera recepción para sumar existencias y llevar el historial de abastecimiento.</p></div>}
        </CardContent>
      </Card>
    </div>
  );
}