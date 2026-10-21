"use client";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPurchase, updatePurchase } from "@/lib/actions/commerce";
import { formatMoney } from "@/lib/locale";
type Product = { id: string; sku: string; name: string; purchasePrice: string };
type Purchase = { id: string; supplierName: string; reference: string | null; note: string | null; purchasedAt: string; lines: Array<{ productId: string; quantity: number; unitCost: string }> };
type DraftLine = { productId: string; quantity: number; unitCost: number };
export function PurchaseDialog({ products, purchase }: { products: Product[]; purchase?: Purchase }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(purchase);
  const fallbackLine = { productId: products[0]?.id ?? "", quantity: 1, unitCost: Number(products[0]?.purchasePrice ?? 0) };
  const [supplierName, setSupplierName] = useState(purchase?.supplierName ?? "");
  const [reference, setReference] = useState(purchase?.reference ?? "");
  const [note, setNote] = useState(purchase?.note ?? "");
  const [purchasedAt, setPurchasedAt] = useState(purchase?.purchasedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<DraftLine[]>(purchase?.lines.map((line) => ({ ...line, unitCost: Number(line.unitCost) })) ?? [fallbackLine]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost), 0), [lines]);
  function reset() {
    setSupplierName(purchase?.supplierName ?? ""); setReference(purchase?.reference ?? ""); setNote(purchase?.note ?? "");
    setPurchasedAt(purchase?.purchasedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setLines(purchase?.lines.map((line) => ({ ...line, unitCost: Number(line.unitCost) })) ?? [fallbackLine]);
  }
  function changeLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }
  function chooseProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    changeLine(index, { productId, unitCost: Number(product?.purchasePrice ?? 0) });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const input = { supplierName, reference, note, purchasedAt: new Date(`${purchasedAt}T12:00`).toISOString(), lines };
      const result = editing ? await updatePurchase(purchase!.id, input) : await createPurchase(input);
      if (result.ok) { toast.success(result.message); setOpen(false); } else toast.error(result.message);
    });
  }
  if (!products.length) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        {editing ? <Button variant="ghost" size="icon-sm" aria-label={`Editar compra ${purchase!.supplierName}`}><Pencil /></Button> : <Button className="h-11 rounded-xl px-5"><Plus /> Registrar compra</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle className="display-heading text-2xl">{editing ? "Editar compra" : "Nueva compra"}</DialogTitle><DialogDescription>Al guardar, las unidades se suman al inventario. Si corriges la compra, las existencias se ajustan por la diferencia.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="supplierName">Proveedor</Label><Input id="supplierName" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Nombre del proveedor" required /></div>
            <div className="space-y-2"><Label htmlFor="purchasedAt">Fecha de compra</Label><Input id="purchasedAt" type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} required /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="reference">Factura o referencia</Label><Input id="reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Opcional" /></div><div className="space-y-2"><Label htmlFor="note">Notas</Label><Input id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional" /></div></div>
          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="font-semibold">Productos recibidos</p><p className="text-xs text-muted-foreground">Cada renglón suma unidades al inventario.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { ...fallbackLine }])}><Plus /> Agregar</Button></div>
            <div className="space-y-3 p-4">
              {lines.map((line, index) => <div key={`${line.productId}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_120px_92px_36px] sm:items-end">
                <div className="space-y-1"><Label className="text-xs">Producto</Label><select value={line.productId} onChange={(event) => chooseProduct(index, event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></div>
                <div className="space-y-1"><Label className="text-xs">Cantidad</Label><Input type="number" min="1" step="1" value={line.quantity} onChange={(event) => changeLine(index, { quantity: Number(event.target.value) })} required /></div>
                <div className="space-y-1"><Label className="text-xs">Costo unitario</Label><Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => changeLine(index, { unitCost: Number(event.target.value) })} required /></div>
                <p className="pb-2 text-right text-sm font-semibold tabular-nums">{formatMoney(line.quantity * line.unitCost)}</p>
                <Button type="button" variant="ghost" size="icon-sm" className="mb-0.5" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Quitar producto"><Trash2 /></Button>
              </div>)}
            </div>
            <div className="flex justify-end border-t border-border bg-muted/40 px-4 py-3"><p className="text-sm text-muted-foreground">Total <span className="ml-3 text-lg font-bold text-foreground">{formatMoney(total)}</span></p></div>
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar compra"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
