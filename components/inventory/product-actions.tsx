"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { adjustStock, archiveProduct, deleteProduct } from "@/lib/actions/commerce";
export function StockAdjustment({ id, name, stock }: { id: string; name: string; stock: number }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState(1);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const result = await adjustStock(id, delta, note);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setNote("");
      } else toast.error(result.message);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ajustar existencias de ${name}`}>
          <SlidersHorizontal />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="display-heading text-2xl">Ajustar existencias</DialogTitle>
          <DialogDescription>
            {name} · hay {stock} unidades registradas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`delta-${id}`}>Cambio en unidades</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setDelta((value) => value - 1)}
              >
                <ArrowDownToLine />
              </Button>
              <Input
                id={`delta-${id}`}
                type="number"
                step="1"
                value={delta}
                onChange={(event) => setDelta(Number(event.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setDelta((value) => value + 1)}
              >
                <ArrowUpFromLine />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Usa un número negativo para retirar unidades.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`note-${id}`}>Motivo</Label>
            <Input
              id={`note-${id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Conteo, merma, devolución…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending || !delta} onClick={save}>
            {pending ? "Guardando…" : "Registrar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function ArchiveProduct({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          title="Retirar del catálogo"
          aria-label={`Retirar ${name}`}
        >
          <Archive />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar este producto?</AlertDialogTitle>
          <AlertDialogDescription>
            “{name}” dejará de estar disponible para la venta. Su historial se conservará.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await archiveProduct(id);
                if (result.ok) toast.success(result.message);
                else toast.error(result.message);
              });
            }}
          >
            {pending ? "Retirando…" : "Retirar producto"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteProduct({ id, name, stock }: { id: string; name: string; stock: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const stockWarning =
    stock > 0 ? ` y se perderán sus ${stock} unidades de existencia registradas` : "";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          disabled={pending}
          aria-label={`Eliminar ${name}`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará “{name}” de forma definitiva{stockWarning}. Esta acción no se puede
            deshacer. Si solo quieres dejar de venderlo, usa Retirar del catálogo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await deleteProduct(id);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else {
                  toast.error(result.message);
                }
              });
            }}
          >
            {pending ? "Eliminando…" : "Eliminar definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
