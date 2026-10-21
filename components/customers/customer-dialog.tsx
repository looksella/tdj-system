"use client";
import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCustomer, updateCustomer } from "@/lib/actions/commerce";
export type Customer = { id: string; name: string; phone: string | null; email: string | null; notes: string | null; isActive: boolean };
export function CustomerDialog({ customer }: { customer?: Customer }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(customer);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = editing ? await updateCustomer(customer!.id, formData) : await createCustomer(formData);
      if (result.ok) { toast.success(result.message); setOpen(false); } else toast.error(result.message);
    });
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{editing ? <Button variant="ghost" size="icon-sm" aria-label={`Editar ${customer!.name}`}><Pencil /></Button> : <Button className="h-11 rounded-xl px-5"><Plus /> Agregar cliente</Button>}</DialogTrigger><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="display-heading text-2xl">{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle><DialogDescription>Guarda sus datos para reconocerlo y dar seguimiento a sus compras.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="name">Nombre</Label><Input id="name" name="name" defaultValue={customer?.name} required placeholder="Nombre completo o del negocio" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} placeholder="Ej. 7000 0000" /></div><div className="space-y-2"><Label htmlFor="email">Correo</Label><Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="Opcional" /></div></div><div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} placeholder="Preferencias, crédito, indicaciones u otra información útil." /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={customer?.isActive ?? true} className="size-4 accent-primary" /> Disponible para nuevas ventas</label><DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar cliente"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
