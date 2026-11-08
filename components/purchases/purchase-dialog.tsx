"use client";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProduct, createPurchase, updatePurchase } from "@/lib/actions/commerce";
import { formatMoney } from "@/lib/locale";
type Product = { id: string; sku: string; name: string; purchasePrice: string };
type Category = { id: string; categoryName: string };
type Purchase = {
  id: string;
  supplierName: string;
  reference: string | null;
  note: string | null;
  purchasedAt: string;
  lines: Array<{ productId: string; quantity: number; unitCost: string }>;
};
type DraftLine = { productId: string; quantity: number; unitCost: number };
function defaultLine(product: Product | undefined): DraftLine {
  return product
    ? { productId: product.id, quantity: 1, unitCost: Number(product.purchasePrice) }
    : { productId: "", quantity: 1, unitCost: 0 };
}
export function PurchaseDialog({
  products,
  categories,
  canCreateProduct,
  purchase,
}: {
  products: Product[];
  categories: Category[];
  canCreateProduct: boolean;
  purchase?: Purchase;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(purchase);
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [supplierName, setSupplierName] = useState(purchase?.supplierName ?? "");
  const [reference, setReference] = useState(purchase?.reference ?? "");
  const [note, setNote] = useState(purchase?.note ?? "");
  const [purchasedAt, setPurchasedAt] = useState(
    purchase?.purchasedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<DraftLine[]>(
    purchase?.lines.map((line) => ({ ...line, unitCost: Number(line.unitCost) })) ??
      (products[0] ? [defaultLine(products[0])] : []),
  );
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newCost, setNewCost] = useState("0");
  const [newMinStock, setNewMinStock] = useState("0");
  const total = useMemo(
    () =>
      lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitCost), 0),
    [lines],
  );
  function reset() {
    setSupplierName(purchase?.supplierName ?? "");
    setReference(purchase?.reference ?? "");
    setNote(purchase?.note ?? "");
    setPurchasedAt(purchase?.purchasedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setLines(
      purchase?.lines.map((line) => ({ ...line, unitCost: Number(line.unitCost) })) ??
        (catalog[0] ? [defaultLine(catalog[0])] : []),
    );
    setNewProductOpen(false);
  }
  function changeLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }
  function chooseProduct(index: number, productId: string) {
    const product = catalog.find((item) => item.id === productId);
    changeLine(index, { productId, unitCost: Number(product?.purchasePrice ?? 0) });
  }
  function openNewProduct() {
    const lastLine = lines[lines.length - 1];
    setNewName("");
    setNewBarcode("");
    setNewCategoryId("");
    setNewSalePrice("");
    setNewCost(String(lastLine?.unitCost ?? 0));
    setNewMinStock("0");
    setNewProductOpen(true);
  }
  function addNewProduct() {
    if (pending) return;
    const name = newName.trim();
    const salePrice = Number(newSalePrice);
    const purchasePrice = Number(newCost || 0);
    const minStock = Number(newMinStock || 0);
    if (!name) {
      toast.error("Escribe el nombre del producto.");
      return;
    }
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      toast.error("El precio de venta debe ser cero o más.");
      return;
    }
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      toast.error("El costo debe ser cero o más.");
      return;
    }
    if (!Number.isInteger(minStock) || minStock < 0) {
      toast.error("El mínimo debe ser un número entero de cero o más.");
      return;
    }
    const formData = new FormData();
    formData.set("name", name);
    formData.set("barcode", newBarcode);
    formData.set("categoryId", newCategoryId);
    formData.set("salePrice", String(salePrice));
    formData.set("purchasePrice", String(purchasePrice));
    formData.set("minStock", String(minStock));
    formData.set("initialStock", "0");
    formData.set("isActive", "on");
    startTransition(async () => {
      const result = await createProduct(formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const created = result.product;
      setCatalog((current) => [...current, created]);
      setLines((current) => [
        ...current,
        { productId: created.id, quantity: 1, unitCost: Number(created.purchasePrice) },
      ]);
      setNewProductOpen(false);
      toast.success(`${result.message} Ya quedó agregado a la compra.`);
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto a la compra.");
      return;
    }
    if (lines.some((line) => !line.productId)) {
      toast.error("Elige un producto en cada renglón.");
      return;
    }
    startTransition(async () => {
      const input = {
        supplierName,
        reference,
        note,
        purchasedAt: new Date(`${purchasedAt}T12:00`).toISOString(),
        lines,
      };
      const result = editing
        ? await updatePurchase(purchase!.id, input)
        : await createPurchase(input);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else toast.error(result.message);
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar compra ${purchase!.supplierName}`}
          >
            <Pencil />
          </Button>
        ) : (
          <Button className="h-11 rounded-xl px-5">
            <Plus /> Registrar compra
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="display-heading text-2xl">
            {editing ? "Editar compra" : "Nueva compra"}
          </DialogTitle>
          <DialogDescription>
            Al guardar, las unidades se suman al inventario. Si corriges la compra, las existencias
            se ajustan por la diferencia.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplierName">Proveedor</Label>
              <Input
                id="supplierName"
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder="Nombre del proveedor"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasedAt">Fecha de compra</Label>
              <Input
                id="purchasedAt"
                type="date"
                value={purchasedAt}
                onChange={(event) => setPurchasedAt(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reference">Factura o referencia</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Notas</Label>
              <Input
                id="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="rounded-xl border border-border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="font-semibold">Productos recibidos</p>
                <p className="text-xs text-muted-foreground">
                  Cada renglón suma unidades al inventario.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canCreateProduct && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openNewProduct}
                    disabled={pending}
                  >
                    <PackagePlus /> Nuevo producto
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((current) => [...current, defaultLine(catalog[0])])}
                  disabled={pending || catalog.length === 0}
                >
                  <Plus /> Agregar
                </Button>
              </div>
            </div>
            {newProductOpen && canCreateProduct && (
              <div className="space-y-3 border-b border-border bg-muted/20 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold">Producto que no está en inventario</p>
                  <p className="text-xs text-muted-foreground">
                    Se crea en Inventario y se agrega a esta compra con la cantidad que indiques.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="new-product-name" className="text-xs">
                      Nombre
                    </Label>
                    <Input
                      id="new-product-name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Nombre del producto"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-product-barcode" className="text-xs">
                      Código de barras (opcional)
                    </Label>
                    <Input
                      id="new-product-barcode"
                      value={newBarcode}
                      onChange={(event) => setNewBarcode(event.target.value)}
                      maxLength={64}
                      inputMode="text"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-product-category" className="text-xs">
                      Categoría
                    </Label>
                    <select
                      id="new-product-category"
                      value={newCategoryId}
                      onChange={(event) => setNewCategoryId(event.target.value)}
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
                  <div className="space-y-1">
                    <Label htmlFor="new-product-sale-price" className="text-xs">
                      Precio de venta
                    </Label>
                    <Input
                      id="new-product-sale-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={newSalePrice}
                      onChange={(event) => setNewSalePrice(event.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-product-cost" className="text-xs">
                      Costo unitario
                    </Label>
                    <Input
                      id="new-product-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={newCost}
                      onChange={(event) => setNewCost(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-product-min-stock" className="text-xs">
                      Mínimo en inventario
                    </Label>
                    <Input
                      id="new-product-min-stock"
                      type="number"
                      min="0"
                      step="1"
                      value={newMinStock}
                      onChange={(event) => setNewMinStock(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewProductOpen(false)}
                    disabled={pending}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={addNewProduct} disabled={pending}>
                    <PackagePlus /> {pending ? "Creando…" : "Crear y agregar"}
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-3 p-4">
              {lines.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  Todavía no hay productos en inventario. Crea el primero con “Nuevo producto”.
                </p>
              )}
              {lines.map((line, index) => (
                <div
                  key={`${line.productId}-${index}`}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_120px_92px_36px] sm:items-end"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">Producto</Label>
                    <select
                      value={line.productId}
                      onChange={(event) => chooseProduct(index, event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {catalog.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} · {product.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) =>
                        changeLine(index, { quantity: Number(event.target.value) })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Costo unitario</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={(event) =>
                        changeLine(index, { unitCost: Number(event.target.value) })
                      }
                      required
                    />
                  </div>
                  <p className="pb-2 text-right text-sm font-semibold tabular-nums">
                    {formatMoney(line.quantity * line.unitCost)}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mb-0.5"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
                    }
                    aria-label="Quitar producto"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-border bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Total{" "}
                <span className="ml-3 text-lg font-bold text-foreground">{formatMoney(total)}</span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar compra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
