"use client";
import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupplier, updateSupplier } from "@/lib/actions/commerce";
export type Supplier = { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; taxId: string | null; address: string | null; paymentTerms: string | null; notes: string | null; isActive: boolean };
export function SupplierDialog({ supplier }: { supplier?: Supplier }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(supplier);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = editing ? await updateSupplier(supplier!.id, formData) : await createSupplier(formData);
      if (result.ok) { toast.success(result.message); setOpen(false); } else toast.error(result.message);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{editing ? <Button variant="ghost" size="icon-sm" aria-label={`Editar ${supplier!.name}`}><Pencil /></Button> : <Button className="h-11 rounded-xl px-5"><Plus /> Agregar proveedor</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle className="display-heading text-2xl">{editing ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle><DialogDescription>Guarda los datos de contacto y las condiciones para tenerlos a mano al reponer mercancía.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Nombre del proveedor</Label><Input id="name" name="name" defaultValue={supplier?.name} required placeholder="Ej. Distribuidora Central" /></div><div className="space-y-2"><Label htmlFor="contactName">Persona de contacto</Label><Input id="contactName" name="contactName" defaultValue={supplier?.contactName ?? ""} placeholder="Opcional" /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} placeholder="Ej. 7000 0000" /></div><div className="space-y-2"><Label htmlFor="email">Correo</Label><Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} placeholder="Opcional" /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="taxId">NIT o identificación</Label><Input id="taxId" name="taxId" defaultValue={supplier?.taxId ?? ""} placeholder="Opcional" /></div><div className="space-y-2"><Label htmlFor="paymentTerms">Condiciones de pago</Label><Input id="paymentTerms" name="paymentTerms" defaultValue={supplier?.paymentTerms ?? ""} placeholder="Ej. Contado, 15 días" /></div></div>
          <div className="space-y-2"><Label htmlFor="address">Dirección</Label><Input id="address" name="address" defaultValue={supplier?.address ?? ""} placeholder="Opcional" /></div>
          <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} placeholder="Productos, horarios, descuentos u otra información útil." /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={supplier?.isActive ?? true} className="size-4 accent-primary" /> Disponible para nuevas compras</label>
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar proveedor"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
