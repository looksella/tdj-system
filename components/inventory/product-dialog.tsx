"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProduct, suggestProductSku, updateProduct } from "@/lib/actions/commerce";
type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  purchasePrice: string;
  salePrice: string;
  minStock: number;
  imageUrl: string | null;
  expiryDate: string | null;
  isActive: boolean;
};
type Category = { id: string; categoryName: string };
export function ProductDialog({
  product,
  categories,
}: {
  product?: Product;
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const skuRequest = useRef(0);
  const editing = Boolean(product);

  useEffect(() => {
    if (!open || editing) return;
    const requestId = ++skuRequest.current;
    setSku("");
    void suggestProductSku(categoryId)
      .then((result) => {
        if (skuRequest.current !== requestId) return;
        if (result.ok) setSku(result.sku);
        else toast.error(result.message);
      })
      .catch(() => {
        if (skuRequest.current === requestId)
          toast.error("No se pudo generar el código del producto.");
      });
    return () => {
      skuRequest.current += 1;
    };
  }, [categoryId, editing, open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = editing
        ? await updateProduct(product!.id, formData)
        : await createProduct(formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else toast.error(result.message);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !editing) setCategoryId("");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${product!.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button className="h-11 rounded-xl px-5">
            <Plus /> Agregar producto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="display-heading text-2xl">
            {editing ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
          <DialogDescription>Completa los datos básicos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sku">Código / SKU</Label>
              <Input
                id="sku"
                name="sku"
                required
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                readOnly={!editing}
                placeholder="Se genera según la categoría"
              />
              {!editing && (
                <p className="text-xs text-muted-foreground">
                  Se genera automáticamente según la categoría.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={product?.name}
                placeholder="Nombre del producto"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="barcode">Código de barras (opcional)</Label>
            <Input
              id="barcode"
              name="barcode"
              defaultValue={product?.barcode ?? ""}
              autoComplete="off"
              inputMode="text"
              maxLength={64}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoryId">Categoría</Label>
            <select
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.categoryName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={product?.description ?? ""}
              rows={2}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="imageUrl">URL de imagen (opcional)</Label>
              <Input
                id="imageUrl"
                name="imageUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://…"
                defaultValue={product?.imageUrl ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                Usa una imagen HTTPS alojada en el almacenamiento configurado.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Fecha de vencimiento (opcional)</Label>
              <Input
                id="expiryDate"
                name="expiryDate"
                type="date"
                defaultValue={product?.expiryDate?.slice(0, 10) ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="salePrice">Precio de venta</Label>
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={product?.salePrice ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Costo</Label>
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={product?.purchasePrice ?? "0"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minStock">Mínimo</Label>
              <Input
                id="minStock"
                name="minStock"
                type="number"
                min="0"
                step="1"
                defaultValue={product?.minStock ?? 0}
              />
            </div>
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="initialStock">Cantidad inicial (opcional)</Label>
              <Input
                id="initialStock"
                name="initialStock"
                type="number"
                min="0"
                step="1"
                defaultValue={0}
              />
              <p className="text-xs text-muted-foreground">
                Unidades que ya tienes de este producto. Se registran como inventario inicial.
              </p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={product?.isActive ?? true}
              className="size-4 accent-primary"
            />{" "}
            Disponible para la venta
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar al inventario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
