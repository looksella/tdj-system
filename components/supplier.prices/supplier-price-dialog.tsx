"use client";
import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupplierPrice, updateSupplierPrice } from "@/lib/actions/commerce";
type Supplier = { id: string; name: string };
type Product = { id: string; sku: string; name: string };
export type SupplierPrice = { id: string; supplierId: string; productId: string; unitCost: string; minimumQuantity: number; note: string | null };
export function SupplierPriceDialog({ suppliers, products, price }: { suppliers: Supplier[]; products: Product[]; price?: SupplierPrice }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(price);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = editing ? await updateSupplierPrice(price!.id, formData) : await createSupplierPrice(formData);
      if (result.ok) { toast.success(result.message); setOpen(false); } else toast.error(result.message);
    });
  }
  if (!suppliers.length || !products.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{editing ? <Button variant="ghost" size="icon-sm" aria-label="Editar precio"><Pencil /></Button> : <Button className="h-11 rounded-xl px-5"><Plus /> Agregar precio</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="display-heading text-2xl">{editing ? "Editar precio" : "Nueva cotización"}</DialogTitle><DialogDescription>Registra cuánto cobra cada proveedor por un producto para compararlo antes de comprar.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="supplierId">Proveedor</Label><select id="supplierId" name="supplierId" defaultValue={price?.supplierId ?? suppliers[0].id} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="productId">Producto</Label><select id="productId" name="productId" defaultValue={price?.productId ?? products[0].id} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="unitCost">Costo unitario</Label><Input id="unitCost" name="unitCost" type="number" min="0" step="0.01" defaultValue={price?.unitCost ?? ""} required /></div><div className="space-y-2"><Label htmlFor="minimumQuantity">Compra mínima</Label><Input id="minimumQuantity" name="minimumQuantity" type="number" min="1" step="1" defaultValue={price?.minimumQuantity ?? 1} required /></div></div><div className="space-y-2"><Label htmlFor="note">Notas</Label><Textarea id="note" name="note" rows={3} defaultValue={price?.note ?? ""} placeholder="Vigencia, presentación, entrega u otra condición." /></div><DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar precio"}</Button></DialogFooter></form></DialogContent>
    </Dialog>
  );
}
