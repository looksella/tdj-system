"use client";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  ShoppingCart,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PrintFrame, TicketVenta, type PrintFrameHandle } from "@/lib/print";
import { formatMoney } from "@/lib/locale";
import {
  cancelSale,
  changeSalePayment,
  createSale,
  searchPosProducts,
} from "@/lib/actions/commerce";
import { RemoteScannerModal } from "@/components/scanner/remote-scanner-modal";
import type { ScannedProduct } from "@/lib/actions/commerce";
import { DiscountPopover } from "@/components/sales/discount-popover";

type PosPresentation = {
  id: string;
  name: string;
  unitsPerPresentation: number;
  salePrice: string;
  /** Cuántas hay sin abrir: solo esas se pueden vender como presentación. */
  closedStock: number;
};
type Product = {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  currentStock: number;
  categoryName: string | null;
  presentations: PosPresentation[];
};
type Sale = {
  id: string;
  number: number;
  total: string;
  paymentMethod: string;
  status: string;
  soldAtLabel: string;
  lines: {
    productName: string;
    quantity: number;
    presentationName: string | null;
    presentationQty: number | null;
  }[];
};
/** `quantity` cuenta presentaciones si `presentationId` existe; si no, unidades individuales. */
type CartLine = Product & {
  presentationId: string | null;
  quantity: number;
  discountCents?: number;
};
type Ticket = {
  number: number;
  soldAt: string;
  lines: CartLine[];
  total: number;
  paymentMethod: string;
  receivedCents: number | null;
  changeCents: number | null;
};

function lineKey(productId: string, presentationId: string | null) {
  return `${productId}|${presentationId ?? ""}`;
}
function findPresentation(presentations: PosPresentation[], id: string | null) {
  return id ? (presentations.find((item) => item.id === id) ?? null) : null;
}
function lineUnitCents(line: CartLine) {
  const presentation = findPresentation(line.presentations, line.presentationId);
  return Math.round(Number(presentation?.salePrice ?? line.salePrice) * 100);
}
function lineUnitsPer(line: CartLine) {
  return findPresentation(line.presentations, line.presentationId)?.unitsPerPresentation ?? 1;
}
/** Unidades individuales que el carrito ya usa de un producto (sin contar las líneas excluidas). */
function unitsInCart(cart: CartLine[], productId: string, exceptKeys: string[] = []) {
  return cart.reduce((sum, line) => {
    if (line.id !== productId) return sum;
    if (exceptKeys.includes(lineKey(line.id, line.presentationId))) return sum;
    return sum + line.quantity * lineUnitsPer(line);
  }, 0);
}

/** Máximo que se puede llevar en una línea: por existencias y, si es presentación, por las sin abrir. */
function maxQuantityFor(line: CartLine, cart: CartLine[]) {
  const presentation = findPresentation(line.presentations, line.presentationId);
  const others = unitsInCart(cart, line.id, [lineKey(line.id, line.presentationId)]);
  const byStock = Math.floor(
    (line.currentStock - others) / (presentation?.unitsPerPresentation ?? 1),
  );
  return presentation ? Math.min(byStock, presentation.closedStock) : byStock;
}

export function PosScreen({
  initialProducts,
  sales,
  salesPage,
  salesPageCount,
  canManageSales,
  scannerEnabled,
  canDiscount,
}: {
  initialProducts: Product[];
  sales: Sale[];
  salesPage: number;
  salesPageCount: number;
  canManageSales: boolean;
  scannerEnabled: boolean;
  canDiscount: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [cashReceived, setCashReceived] = useState("");
  const [pending, startTransition] = useTransition();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const ticketRef = useRef<PrintFrameHandle>(null);
  const subtotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + lineUnitCents(line) * line.quantity, 0),
    [cart],
  );
  const discountTotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + (line.discountCents ?? 0), 0),
    [cart],
  );
  const totalCents = subtotalCents - discountTotalCents;
  const total = totalCents / 100;
  const receivedCents = /^\d+(?:\.\d{1,2})?$/.test(cashReceived.trim())
    ? Math.round(Number(cashReceived) * 100)
    : null;
  const changeCents =
    receivedCents === null || !Number.isSafeInteger(receivedCents)
      ? null
      : receivedCents - totalCents;
  const cashValid = paymentMethod !== "Efectivo" || (changeCents !== null && changeCents >= 0);
  useEffect(() => {
    let live = true;
    if (term.trim().length < 2) {
      setProducts(initialProducts);
      return;
    }
    const timeout = setTimeout(() => {
      searchPosProducts(term)
        .then((result) => {
          if (live) setProducts(result);
        })
        .catch(() => toast.error("No se pudo buscar el producto."));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [term, initialProducts]);

  /** Agrega 1 unidad o 1 presentación. Devuelve false si no alcanza el inventario. */
  function add(product: Product, presentationId: string | null = null): boolean {
    const presentation = findPresentation(product.presentations, presentationId);
    if (presentationId && !presentation) return false;
    const perUnit = presentation?.unitsPerPresentation ?? 1;
    if (unitsInCart(cart, product.id) + perUnit > product.currentStock) return false;
    const key = lineKey(product.id, presentation?.id ?? null);
    if (presentation) {
      const alreadyInCart =
        cart.find((line) => lineKey(line.id, line.presentationId) === key)?.quantity ?? 0;
      if (alreadyInCart + 1 > presentation.closedStock) return false;
    }
    setCart((current) => {
      const existing = current.find((line) => lineKey(line.id, line.presentationId) === key);
      if (existing)
        return current.map((line) =>
          lineKey(line.id, line.presentationId) === key
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      return [...current, { ...product, presentationId: presentation?.id ?? null, quantity: 1 }];
    });
    return true;
  }
  function addScanned(product: ScannedProduct): "ok" | "sin_stock" {
    return add(product, product.scannedPresentationId) ? "ok" : "sin_stock";
  }
  function changeQuantity(line: CartLine, delta: number) {
    const key = lineKey(line.id, line.presentationId);
    const maxQuantity = maxQuantityFor(line, cart);
    setCart((current) =>
      current
        .map((item) => {
          if (lineKey(item.id, item.presentationId) !== key) return item;
          const quantity = Math.min(maxQuantity, item.quantity + delta);
          const discountCents = Math.min(item.discountCents ?? 0, lineUnitCents(item) * quantity);
          return {
            ...item,
            quantity,
            discountCents: discountCents > 0 ? discountCents : undefined,
          };
        })
        .filter((item) => item.quantity > 0),
    );
  }
  function changePresentation(line: CartLine, presentationId: string | null) {
    if ((line.presentationId ?? null) === presentationId) return;
    const next = findPresentation(line.presentations, presentationId);
    if (presentationId && !next) return;
    const perUnit = next?.unitsPerPresentation ?? 1;
    const oldKey = lineKey(line.id, line.presentationId);
    const newKey = lineKey(line.id, presentationId);
    const others = unitsInCart(cart, line.id, [oldKey, newKey]);
    const byStock = Math.floor((line.currentStock - others) / perUnit);
    const maxQuantity = next ? Math.min(byStock, next.closedStock) : byStock;
    if (maxQuantity < 1) {
      toast.error(
        next
          ? `No hay ${next.name.toLowerCase()} sin abrir para vender.`
          : "No hay suficiente inventario para esa presentación.",
      );
      return;
    }
    const target = cart.find((item) => lineKey(item.id, item.presentationId) === newKey);
    const quantity = Math.min(maxQuantity, line.quantity + (target?.quantity ?? 0));
    setCart((current) => {
      const result: CartLine[] = [];
      for (const item of current) {
        const itemKey = lineKey(item.id, item.presentationId);
        if (itemKey === oldKey) {
          result.push({ ...item, presentationId, quantity, discountCents: undefined });
        } else if (itemKey !== newKey) {
          result.push(item);
        }
      }
      return result;
    });
  }
  function setDiscount(key: string, discountCents: number) {
    setCart((current) =>
      current.map((item) =>
        lineKey(item.id, item.presentationId) === key
          ? { ...item, discountCents: discountCents > 0 ? discountCents : undefined }
          : item,
      ),
    );
  }
  function removeLine(key: string) {
    setCart((current) => current.filter((item) => lineKey(item.id, item.presentationId) !== key));
  }
  function checkout() {
    if (!cart.length || !cashValid) return;
    startTransition(async () => {
      const result = await createSale(
        cart.map(({ id, presentationId, quantity, discountCents }) => ({
          productId: id,
          presentationId,
          quantity,
          discountCents,
        })),
        paymentMethod,
        paymentMethod === "Efectivo" ? receivedCents! : undefined,
        totalCents,
      );
      if (!result.ok || !result.saleNumber || !result.soldAt || result.totalCents === undefined) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setTicket({
        number: result.saleNumber,
        soldAt: result.soldAt,
        lines: cart,
        total: result.totalCents / 100,
        paymentMethod,
        receivedCents: paymentMethod === "Efectivo" ? receivedCents : null,
        changeCents: paymentMethod === "Efectivo" ? receivedCents! - result.totalCents : null,
      });
      setCart([]);
      setCashReceived("");
    });
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
      <Card className="panel-shadow border-border/80">
        <CardHeader className="pb-3">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Venta rápida
              </p>
              <CardTitle className="display-heading mt-1 text-2xl">Elige tus productos</CardTitle>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Buscar por nombre o código…"
                  className="h-11 rounded-xl pl-9"
                />
              </div>
              <RemoteScannerModal mode="pos" enabled={scannerEnabled} onFound={addScanned} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {products.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <div key={product.id} className="space-y-2">
                  <button
                    type="button"
                    disabled={product.currentStock <= 0}
                    onClick={() => {
                      if (!add(product)) toast.error("No hay más existencias de este producto.");
                    }}
                    className="group w-full rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                        <ShoppingBag className="size-5" />
                      </span>
                      <Badge variant={product.currentStock > 0 ? "outline" : "destructive"}>
                        {product.currentStock > 0 ? `${product.currentStock} disp.` : "Agotado"}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 min-h-10 font-semibold leading-5">{product.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {product.sku}
                      {product.categoryName ? ` · ${product.categoryName}` : ""}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-lg font-bold text-primary">
                        {formatMoney(Number(product.salePrice))}
                        {product.presentations.length > 0 && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            individual
                          </span>
                        )}
                      </span>
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-105">
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </button>
                  {product.presentations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {product.presentations.map((presentation) => (
                        <Button
                          key={presentation.id}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            presentation.closedStock < 1 ||
                            product.currentStock < presentation.unitsPerPresentation
                          }
                          onClick={() => {
                            if (!add(product, presentation.id))
                              toast.error(
                                `No hay más ${presentation.name.toLowerCase()} sin abrir de este producto.`,
                              );
                          }}
                        >
                          <Plus /> {presentation.name} x{presentation.unitsPerPresentation} ·{" "}
                          {formatMoney(Number(presentation.salePrice))}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({presentation.closedStock} sin abrir)
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <ShoppingBag className="mb-3 size-9 text-muted-foreground/50" />
              <p className="font-semibold">No encontramos productos</p>
              <p className="mt-1 text-sm text-muted-foreground">Prueba con otro nombre o código.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="panel-shadow h-fit border-border/80 xl:sticky xl:top-6">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Mostrador
              </p>
              <CardTitle className="display-heading mt-1 text-2xl">Venta actual</CardTitle>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <ShoppingCart className="size-5" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          {cart.length ? (
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {cart.map((line) => {
                const key = lineKey(line.id, line.presentationId);
                const presentation = findPresentation(line.presentations, line.presentationId);
                const unitCents = lineUnitCents(line);
                const lineSubtotal = unitCents * line.quantity;
                const maxQuantity = maxQuantityFor(line, cart);
                const options: { id: string | null; label: string }[] = [
                  { id: null, label: "Individual" },
                  ...line.presentations.map((item) => ({ id: item.id, label: item.name })),
                ];
                return (
                  <div key={key} className="space-y-2 rounded-xl bg-muted/50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{line.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(unitCents / 100)}{" "}
                          {presentation
                            ? `por ${presentation.name.toLowerCase()} (${presentation.unitsPerPresentation} unid.)`
                            : "c/u"}
                        </p>
                        {line.discountCents ? (
                          <p className="text-xs">
                            <span className="text-muted-foreground line-through">
                              {formatMoney(lineSubtotal / 100)}
                            </span>{" "}
                            <span className="font-semibold text-primary">
                              {formatMoney((lineSubtotal - line.discountCents) / 100)}
                            </span>{" "}
                            <Badge variant="secondary">
                              −{formatMoney(line.discountCents / 100)}
                            </Badge>
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          aria-label="Quitar una unidad"
                          onClick={() => changeQuantity(line, -1)}
                        >
                          <Minus />
                        </Button>
                        <span className="w-7 text-center text-sm font-bold tabular-nums">
                          {line.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          aria-label="Agregar una unidad"
                          disabled={line.quantity >= maxQuantity}
                          onClick={() => changeQuantity(line, 1)}
                        >
                          <Plus />
                        </Button>
                      </div>
                      {canDiscount && (
                        <DiscountPopover
                          name={line.name}
                          subtotalCents={lineSubtotal}
                          discountCents={line.discountCents ?? 0}
                          onApply={(cents) => setDiscount(key, cents)}
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Quitar ${line.name}`}
                        onClick={() => removeLine(key)}
                      >
                        <X />
                      </Button>
                    </div>
                    {line.presentations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {options.map((option) => (
                          <Button
                            key={option.id ?? "individual"}
                            type="button"
                            size="sm"
                            variant={
                              (line.presentationId ?? null) === option.id ? "secondary" : "outline"
                            }
                            aria-pressed={(line.presentationId ?? null) === option.id}
                            disabled={
                              option.id !== null &&
                              (line.presentationId ?? null) !== option.id &&
                              (findPresentation(line.presentations, option.id)?.closedStock ?? 0) <
                                1
                            }
                            className="h-7 px-2 text-xs"
                            onClick={() => changePresentation(line, option.id)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed text-center">
              <ShoppingCart className="mb-2 size-8 text-muted-foreground/45" />
              <p className="text-sm font-semibold">Tu venta está vacía</p>
              <p className="mt-1 text-xs text-muted-foreground">Toca un producto para agregarlo.</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="payment">
              Forma de pago
            </label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="payment" className="h-11 rounded-xl">
                <SelectValue placeholder="Elige una forma de pago" />
              </SelectTrigger>
              <SelectContent>
                {["Efectivo", "Tarjeta", "Transferencia", "Crédito", "Otro"].map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {discountTotalCents > 0 && (
            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatMoney(subtotalCents / 100)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuentos</span>
                <span className="tabular-nums text-primary">
                  −{formatMoney(discountTotalCents / 100)}
                </span>
              </div>
            </div>
          )}
          <div className="flex items-end justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Total a cobrar</span>
            <span className="text-3xl font-bold tabular-nums">{formatMoney(total)}</span>
          </div>
          {paymentMethod === "Efectivo" && (
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="cashReceived">
                Efectivo recibido
              </label>
              <Input
                id="cashReceived"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={cashReceived}
                onChange={(event) => setCashReceived(event.target.value)}
                className="h-11 rounded-xl"
              />
              <p
                aria-live="polite"
                className={
                  changeCents !== null && changeCents >= 0
                    ? "text-lg font-bold text-primary"
                    : "text-sm text-muted-foreground"
                }
              >
                {cashReceived === ""
                  ? "Ingresa el efectivo para calcular el vuelto."
                  : changeCents === null
                    ? "Ingresa un importe válido en dólares y centavos."
                    : changeCents < 0
                      ? `Faltan ${formatMoney(-changeCents / 100)} para cobrar.`
                      : `Vuelto: ${formatMoney(changeCents / 100)}`}
              </p>
            </div>
          )}
          <Button
            type="button"
            disabled={!cart.length || pending || !cashValid}
            onClick={checkout}
            className="h-12 w-full rounded-xl text-base font-bold"
          >
            {pending ? "Registrando…" : "Cobrar"}
            <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Al cobrar, las existencias se descuentan automáticamente.
          </p>
        </CardContent>
      </Card>
      {ticket && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setTicket(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Check className="size-7" />
              </div>
              <DialogTitle className="display-heading text-center text-2xl">
                Venta registrada
              </DialogTitle>
              <DialogDescription className="text-center">
                Venta #{ticket.number} · {formatMoney(ticket.total)}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-muted/50 p-4 text-sm">
              <p className="font-semibold">{ticket.lines.length} productos</p>
              <p className="mt-1 text-muted-foreground">Pago con {ticket.paymentMethod}</p>
              {ticket.receivedCents !== null && ticket.changeCents !== null && (
                <div className="mt-3 border-t border-border pt-3">
                  <p>Recibido: {formatMoney(ticket.receivedCents / 100)}</p>
                  <p className="mt-1 text-lg font-bold text-primary">
                    Vuelto: {formatMoney(ticket.changeCents / 100)}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="sm:justify-center">
              <Button type="button" variant="outline" onClick={() => setTicket(null)}>
                Cerrar
              </Button>
              <Button type="button" onClick={() => ticketRef.current?.imprimir()}>
                <Printer /> Imprimir ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {ticket && (
        <PrintFrame ref={ticketRef} familia="ticket">
          <TicketVenta
            negocio="Buen Negocio"
            comprobante={`Venta #${ticket.number}`}
            fecha={ticket.soldAt}
            lineas={ticket.lines.map((line) => {
              const presentation = findPresentation(line.presentations, line.presentationId);
              const unitCents = lineUnitCents(line);
              return {
                descripcion: presentation
                  ? `${line.name} (${presentation.name} x${presentation.unitsPerPresentation})`
                  : line.name,
                cantidad: line.quantity,
                precioUnitario: unitCents / 100,
                total: (unitCents * line.quantity) / 100,
                descuento: line.discountCents ? line.discountCents / 100 : undefined,
              };
            })}
            total={ticket.total}
            pago={ticket.paymentMethod}
          />
        </PrintFrame>
      )}
      <section className="space-y-3 xl:col-span-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Registro</p>
            <h2 className="display-heading text-2xl">Ventas recientes</h2>
          </div>
          {canManageSales && (
            <span className="text-xs text-muted-foreground">
              Anular devuelve las unidades al inventario.
            </span>
          )}
        </div>
        {sales.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {sales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} canManageSales={canManageSales} />
              ))}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Página {salesPage} de {salesPageCount}
              </span>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" disabled={salesPage <= 1}>
                  <Link prefetch={false} href={`/ventas?page=${Math.max(1, salesPage - 1)}`}>
                    <ChevronLeft />
                    Anterior
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={salesPage >= salesPageCount}>
                  <Link
                    prefetch={false}
                    href={`/ventas?page=${Math.min(salesPageCount, salesPage + 1)}`}
                  >
                    Siguiente
                    <ChevronRight />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-3 p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <ShoppingCart className="size-5 text-muted-foreground" />
              </span>
              <div>
                <p className="font-semibold">Aún no hay ventas registradas</p>
                <p className="text-sm text-muted-foreground">
                  Las ventas que cobres aparecerán aquí con su fecha y detalle.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
function SaleCard({ sale, canManageSales }: { sale: Sale; canManageSales: boolean }) {
  const [open, setOpen] = useState(false);
  const [payment, setPayment] = useState(sale.paymentMethod);
  const [pending, startTransition] = useTransition();
  const completed = sale.status === "completada";
  function update(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await changeSalePayment(sale.id, payment);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else toast.error(result.message);
    });
  }
  return (
    <Card className="border-border/80">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">Venta #{sale.number}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sale.soldAtLabel} · {sale.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
              artículos
            </p>
            <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
              {sale.lines
                .map((line) =>
                  line.presentationName && line.presentationQty
                    ? `${line.presentationQty} × ${line.presentationName} de ${line.productName}`
                    : `${line.quantity} × ${line.productName}`,
                )
                .join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{formatMoney(Number(sale.total))}</p>
            <Badge variant={completed ? "secondary" : "outline"}>
              {completed ? "Completada" : "Anulada"}
            </Badge>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">Pago: {sale.paymentMethod}</p>
          {canManageSales && completed && (
            <div className="flex gap-2">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Editar pago
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Editar forma de pago</DialogTitle>
                    <DialogDescription>Venta #{sale.number}</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={update} className="space-y-4">
                    <Select value={payment} onValueChange={setPayment}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Efectivo", "Tarjeta", "Transferencia", "Crédito", "Otro"].map(
                          (method) => (
                            <SelectItem value={method} key={method}>
                              {method}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <DialogFooter>
                      <Button type="submit" disabled={pending}>
                        {pending ? "Guardando…" : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (
                    !window.confirm(
                      `¿Anular la venta #${sale.number}? Las existencias se devolverán al inventario.`,
                    )
                  )
                    return;
                  startTransition(async () => {
                    const result = await cancelSale(sale.id);
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.message);
                  });
                }}
                disabled={pending}
              >
                Anular venta
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
