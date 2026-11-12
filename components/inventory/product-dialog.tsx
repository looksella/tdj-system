"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { formatMoney } from "@/lib/locale";
import { dollarsToCents } from "@/lib/pricing";
import { isBelowCost, suggestPackagePriceCents, suggestUnitPriceCents } from "@/lib/presentations";

type PresentationRow = {
  id: string;
  name: string;
  unitsPerPresentation: number;
  salePrice: string;
  barcode: string | null;
};
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
  presentations?: PresentationRow[];
};
type Category = { id: string; categoryName: string };
type Draft = { key: string; name: string; units: string; salePrice: string; barcode: string };

const MAX_PRESENTATIONS = 4;

function draftsFrom(product?: Product): Draft[] {
  return (product?.presentations ?? []).map((row) => ({
    key: row.id,
    name: row.name,
    units: String(row.unitsPerPresentation),
    salePrice: row.salePrice,
    barcode: row.barcode ?? "",
  }));
}

function toCents(value: string): number | null {
  const clean = value.trim();
  return clean === "" ? null : dollarsToCents(clean);
}

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
  const [salePrice, setSalePrice] = useState(product?.salePrice ?? "");
  const [purchasePrice, setPurchasePrice] = useState(product?.purchasePrice ?? "0");
  const [drafts, setDrafts] = useState<Draft[]>(() => draftsFrom(product));
  const draftCounter = useRef(0);
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
    if (nextOpen) {
      setSalePrice(product?.salePrice ?? "");
      setPurchasePrice(product?.purchasePrice ?? "0");
      setDrafts(draftsFrom(product));
    } else if (!editing) {
      setCategoryId("");
    }
  }

  function addDraft() {
    const key = `new-${++draftCounter.current}`;
    setDrafts((current) =>
      current.length >= MAX_PRESENTATIONS
        ? current
        : [
            ...current,
            {
              key,
              name: current.length === 0 ? "Paquete" : "",
              units: "",
              salePrice: "",
              barcode: "",
            },
          ],
    );
  }
  function updateDraft(key: string, changes: Partial<Draft>) {
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }
  function removeDraft(key: string) {
    setDrafts((current) => current.filter((row) => row.key !== key));
  }

  const unitCents = toCents(salePrice);
  const costCents = toCents(purchasePrice);

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
              <Label htmlFor="salePrice">Precio individual</Label>
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                min="0"
                step="0.01"
                required
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Costo por unidad</Label>
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minStock">Mínimo (unidades)</Label>
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

          <div className="space-y-3 rounded-2xl border p-4">
            <div>
              <p className="text-sm font-semibold">Presentaciones (opcional)</p>
              <p className="text-xs text-muted-foreground">
                Si este producto también se vende por paquete, fardo o caja, agrégalo aquí con su
                propio precio. Las existencias siempre se cuentan en unidades individuales.
              </p>
            </div>
            <input
              type="hidden"
              name="presentations"
              value={JSON.stringify(
                drafts.map((row) => ({
                  name: row.name,
                  unitsPerPresentation: Number(row.units),
                  salePrice: row.salePrice,
                  barcode: row.barcode,
                })),
              )}
            />
            {drafts.map((row, index) => {
              const units = Number(row.units);
              const unitsOk = Number.isInteger(units) && units >= 2;
              const packCents = toCents(row.salePrice);
              const suggestedUnit =
                unitsOk && packCents !== null && unitCents === null
                  ? suggestUnitPriceCents(packCents, units)
                  : 0;
              const suggestedPack =
                unitsOk && unitCents !== null && packCents === null
                  ? suggestPackagePriceCents(unitCents, units)
                  : 0;
              const belowCost =
                unitsOk &&
                packCents !== null &&
                costCents !== null &&
                costCents > 0 &&
                isBelowCost(packCents, costCents, units);
              return (
                <div key={row.key} className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Presentación {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Quitar presentación ${index + 1}`}
                      onClick={() => removeDraft(row.key)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor={`pres-name-${row.key}`}>Nombre</Label>
                      <Input
                        id={`pres-name-${row.key}`}
                        required
                        maxLength={40}
                        placeholder="Paquete, Fardo…"
                        value={row.name}
                        onChange={(event) => updateDraft(row.key, { name: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`pres-units-${row.key}`}>Trae (unidades)</Label>
                      <Input
                        id={`pres-units-${row.key}`}
                        type="number"
                        min="2"
                        step="1"
                        required
                        value={row.units}
                        onChange={(event) => updateDraft(row.key, { units: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`pres-price-${row.key}`}>Precio de venta</Label>
                      <Input
                        id={`pres-price-${row.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={row.salePrice}
                        onChange={(event) =>
                          updateDraft(row.key, { salePrice: event.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pres-barcode-${row.key}`}>
                      Código de barras de la caja (opcional)
                    </Label>
                    <Input
                      id={`pres-barcode-${row.key}`}
                      maxLength={64}
                      autoComplete="off"
                      value={row.barcode}
                      onChange={(event) => updateDraft(row.key, { barcode: event.target.value })}
                    />
                  </div>
                  {suggestedUnit > 0 && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Sugerido para la unidad individual:{" "}
                      <strong>{formatMoney(suggestedUnit / 100)}</strong>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSalePrice((suggestedUnit / 100).toFixed(2))}
                      >
                        Usar
                      </Button>
                    </p>
                  )}
                  {suggestedPack > 0 && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Sugerido para esta presentación:{" "}
                      <strong>{formatMoney(suggestedPack / 100)}</strong>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          updateDraft(row.key, { salePrice: (suggestedPack / 100).toFixed(2) })
                        }
                      >
                        Usar
                      </Button>
                    </p>
                  )}
                  {unitsOk && packCents !== null && unitCents !== null && (
                    <p className="text-xs text-muted-foreground">
                      Dentro de esta presentación cada unidad sale a{" "}
                      {formatMoney(packCents / units / 100)} (individual:{" "}
                      {formatMoney(unitCents / 100)}).
                    </p>
                  )}
                  {belowCost && (
                    <p className="text-xs font-semibold text-destructive">
                      Ojo: el precio queda por debajo del costo (
                      {formatMoney(((costCents ?? 0) * units) / 100)} por{" "}
                      {row.name.toLowerCase() || "presentación"}).
                    </p>
                  )}
                </div>
              );
            })}
            {drafts.length < MAX_PRESENTATIONS && (
              <Button type="button" variant="outline" size="sm" onClick={addDraft}>
                <Plus /> Agregar presentación
              </Button>
            )}
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
                En unidades individuales. Si tienes 12 paquetes de 10, escribe 120. Se registran
                como inventario inicial.
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
