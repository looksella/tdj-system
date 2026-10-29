"use client";
import Link from "next/link";
import { Search, PackageOpen, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/locale";
import { ProductDialog } from "@/components/inventory/product-dialog";
import { ArchiveProduct, StockAdjustment } from "@/components/inventory/product-actions";
type Category = { id: string; categoryName: string };
type Product = { id: string; sku: string; name: string; description: string | null; categoryId: string | null; categoryName: string; purchasePrice: string; salePrice: string; currentStock: number; minStock: number; imageUrl: string | null; isActive: boolean };
export function ProductTable({ products, categories, page, pageCount, total, search, categoryId, lowOnly, canManage }: { products: Product[]; categories: Category[]; page: number; pageCount: number; total: number; search: string; categoryId: string; lowOnly: boolean; canManage: boolean }) {
  return (
    <div className="space-y-5">
      <Card className="panel-shadow overflow-hidden border-border/80">
        <CardContent className="p-4 sm:p-5">
          <form className="grid gap-3 md:grid-cols-[1fr_240px_auto_auto]" action="/inventario">
            <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" defaultValue={search} placeholder="Busca por nombre o código…" className="h-11 rounded-xl pl-9" /></div>
            <select name="categoria" defaultValue={categoryId || "__all__"} className="h-11 rounded-xl border border-input bg-background px-3 text-sm"><option value="__all__">Todas las categorías</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.categoryName}</option>)}</select>
            <select name="stock" defaultValue={lowOnly ? "bajo" : "todos"} className="h-11 rounded-xl border border-input bg-background px-3 text-sm"><option value="todos">Todo el inventario</option><option value="bajo">Necesita reposición</option></select>
            <Button type="submit" variant="secondary" className="h-11 rounded-xl">Aplicar filtros</Button>
          </form>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{total.toLocaleString("es-SV")} productos encontrados</span><span>Las existencias se mueven con ventas y ajustes registrados.</span></div>
        </CardContent>
      </Card>
      {products.length ? <Card className="panel-shadow overflow-hidden border-border/80"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-muted/55 hover:bg-muted/55"><TableHead className="min-w-[260px]">Producto</TableHead><TableHead>Categoría</TableHead><TableHead>Precio</TableHead><TableHead>Existencias</TableHead><TableHead>Estado</TableHead>{canManage && <TableHead className="text-right">Acciones</TableHead>}</TableRow></TableHeader>
        <TableBody>{products.map((product) => {
          const low = product.currentStock <= product.minStock;
          return <TableRow key={product.id} className="h-[76px]">
            <TableCell><div className="flex items-center gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><PackageOpen className="size-5" /></div><div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{product.sku}</p></div></div></TableCell>
            <TableCell className="max-w-[190px] truncate text-muted-foreground">{product.categoryName || "Sin categoría"}</TableCell>
            <TableCell className="font-semibold">{formatMoney(Number(product.salePrice))}</TableCell>
            <TableCell><div className="flex items-center gap-2"><span className="font-semibold tabular-nums">{product.currentStock}</span>{low && <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800"><CircleAlert className="size-3" /> Reponer</Badge>}</div><p className="mt-1 text-[11px] text-muted-foreground">Mínimo {product.minStock}</p></TableCell>
            <TableCell><Badge variant={product.isActive ? "secondary" : "outline"}>{product.isActive ? "Activo" : "Retirado"}</Badge></TableCell>
            {canManage && <TableCell><div className="flex justify-end"><StockAdjustment id={product.id} name={product.name} stock={product.currentStock} /><ProductDialog product={product} categories={categories} />{product.isActive && <ArchiveProduct id={product.id} name={product.name} />}</div></TableCell>}
          </TableRow>;
        })}</TableBody>
      </Table></div>
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">Página {page} de {pageCount}</span><div className="flex gap-2"><Button asChild variant="outline" size="sm" disabled={page <= 1}><Link prefetch={false} href={page <= 2 ? `/inventario?q=${encodeURIComponent(search)}&categoria=${categoryId || "__all__"}&stock=${lowOnly ? "bajo" : "todos"}` : `/inventario?page=${page - 1}&q=${encodeURIComponent(search)}&categoria=${categoryId || "__all__"}&stock=${lowOnly ? "bajo" : "todos"}`}><ChevronLeft />Anterior</Link></Button><Button asChild variant="outline" size="sm" disabled={page >= pageCount}><Link prefetch={false} href={`/inventario?page=${page + 1}&q=${encodeURIComponent(search)}&categoria=${categoryId || "__all__"}&stock=${lowOnly ? "bajo" : "todos"}`}>Siguiente<ChevronRight /></Link></Button></div></div>
      </Card> : <Card className="panel-shadow border-dashed"><CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><PackageOpen className="size-7" /></span><h2 className="display-heading text-2xl">{search || categoryId || lowOnly ? "No hay coincidencias" : "Tu inventario está listo para crecer"}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{search || categoryId || lowOnly ? "Prueba cambiar la búsqueda o quitar algún filtro." : "Agrega tu primer producto para comenzar a controlar existencias y precios."}</p>{canManage && !search && !categoryId && !lowOnly && <div className="mt-5"><ProductDialog categories={categories} /></div>}</CardContent></Card>}
    </div>
  );
}
