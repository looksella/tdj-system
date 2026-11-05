"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  PackageOpen,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/locale";
import { ProductDialog } from "@/components/inventory/product-dialog";
import {
  ArchiveProduct,
  DeleteProduct,
  StockAdjustment,
} from "@/components/inventory/product-actions";

type Category = { id: string; categoryName: string };
type SortKey = "producto" | "categoria" | "precio" | "existencias" | "vencimiento" | "estado";
type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string;
  purchasePrice: string;
  salePrice: string;
  currentStock: number;
  minStock: number;
  imageUrl: string | null;
  expiryDate: string | null;
  isActive: boolean;
};

const SORT_LABELS: Array<{ key: SortKey; label: string }> = [
  { key: "producto", label: "Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "precio", label: "Precio" },
  { key: "existencias", label: "Existencias" },
  { key: "vencimiento", label: "Vencimiento" },
  { key: "estado", label: "Estado" },
];

export function ProductTable({
  products,
  categories,
  page,
  pageCount,
  total,
  search,
  categoryId,
  lowOnly,
  canManage,
  sort,
  direction,
}: {
  products: Product[];
  categories: Category[];
  page: number;
  pageCount: number;
  total: number;
  search: string;
  categoryId: string;
  lowOnly: boolean;
  canManage: boolean;
  sort: SortKey;
  direction: "asc" | "desc";
}) {
  function inventoryHref(nextPage: number, nextSort = sort, nextDirection = direction) {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    if (search) params.set("q", search);
    if (categoryId) params.set("categoria", categoryId);
    if (lowOnly) params.set("stock", "bajo");
    params.set("ordenar", nextSort);
    params.set("direccion", nextDirection);
    return `/inventario?${params.toString()}`;
  }

  const exportParams = new URLSearchParams();
  if (search) exportParams.set("q", search);
  if (categoryId) exportParams.set("categoria", categoryId);
  if (lowOnly) exportParams.set("stock", "bajo");
  exportParams.set("ordenar", sort);
  exportParams.set("direccion", direction);

  return (
    <div className="space-y-5">
      <Card className="panel-shadow overflow-hidden border-border/80">
        <CardContent className="p-4 sm:p-5">
          <form className="grid gap-3 md:grid-cols-[1fr_240px_auto_auto]" action="/inventario">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={search}
                placeholder="Busca por nombre o código…"
                aria-label="Buscar producto por nombre o código"
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <select
              name="categoria"
              defaultValue={categoryId || "__all__"}
              aria-label="Filtrar por categoría"
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="__all__">Todas las categorías</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.categoryName}
                </option>
              ))}
            </select>
            <select
              name="stock"
              defaultValue={lowOnly ? "bajo" : "todos"}
              aria-label="Filtrar por nivel de existencias"
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="todos">Todo el inventario</option>
              <option value="bajo">Necesita reposición</option>
            </select>
            <Button type="submit" variant="secondary" className="h-11 rounded-xl">
              Aplicar filtros
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{total.toLocaleString("es-SV")} productos encontrados</span>
            <div className="flex items-center gap-4">
              <span>Las existencias se mueven con ventas y ajustes registrados.</span>
              <a
                href={`/api/inventario/exportar?${exportParams.toString()}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="size-4" aria-hidden="true" />
                Exportar CSV
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {products.length ? (
        <Card className="panel-shadow overflow-hidden border-border/80">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/55 hover:bg-muted/55">
                  {SORT_LABELS.map(({ key, label }) => {
                    const active = sort === key;
                    const nextDirection = active && direction === "asc" ? "desc" : "asc";
                    const icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    const SortIcon = icon;
                    return (
                      <TableHead
                        key={key}
                        aria-sort={
                          active ? (direction === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={key === "producto" ? "min-w-[260px]" : undefined}
                      >
                        <Link
                          href={inventoryHref(1, key, nextDirection)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded px-1 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {label}
                          <SortIcon className="size-3.5" aria-hidden="true" />
                        </Link>
                      </TableHead>
                    );
                  })}
                  {canManage && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const low = product.currentStock <= product.minStock;
                  return (
                    <TableRow key={product.id} className="h-[76px]">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-primary">
                            {product.imageUrl ? (
                              // Image URLs are restricted to the configured storage origin server-side.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.imageUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <PackageOpen className="size-5" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.sku}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[190px] truncate text-muted-foreground">
                        {product.categoryName || "Sin categoría"}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatMoney(Number(product.salePrice))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{product.currentStock}</span>
                          {low && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-300 bg-amber-50 text-amber-800"
                            >
                              <CircleAlert className="size-3" aria-hidden="true" />
                              Reponer
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Mínimo {product.minStock}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {product.expiryDate ? formatDate(product.expiryDate) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.isActive ? "secondary" : "outline"}>
                          {product.isActive ? "Activo" : "Retirado"}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex justify-end">
                            <StockAdjustment
                              id={product.id}
                              name={product.name}
                              stock={product.currentStock}
                            />
                            <ProductDialog product={product} categories={categories} />
                            {product.isActive && (
                              <ArchiveProduct id={product.id} name={product.name} />
                            )}
                            <DeleteProduct
                              id={product.id}
                              name={product.name}
                              stock={product.currentStock}
                            />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Página {page} de {pageCount}
            </span>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                <Link href={inventoryHref(Math.max(1, page - 1))}>
                  <ChevronLeft aria-hidden="true" />
                  Anterior
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" disabled={page >= pageCount}>
                <Link href={inventoryHref(Math.min(pageCount, page + 1))}>
                  Siguiente
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="panel-shadow border-dashed">
          <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <PackageOpen className="size-7" aria-hidden="true" />
            </span>
            <h2 className="display-heading text-2xl">
              {search || categoryId || lowOnly
                ? "No hay coincidencias"
                : "Tu inventario está listo para crecer"}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {search || categoryId || lowOnly
                ? "Prueba cambiar la búsqueda o quitar algún filtro."
                : "Agrega tu primer producto para comenzar a controlar existencias y precios."}
            </p>
            {canManage && !search && !categoryId && !lowOnly && (
              <div className="mt-5">
                <ProductDialog categories={categories} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
