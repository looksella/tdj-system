"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  FileText,
  HandCoins,
  Home,
  Package,
  Receipt,
  Sparkles,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
const links = [
  { label: "Inicio", href: "/", icon: Home, group: "Principal" },
  { label: "Inventario", href: "/inventario", icon: Package, group: "Principal" },
  { label: "Punto de venta", href: "/ventas", icon: Receipt, group: "Principal" },
  { label: "Compras", href: "/compras", icon: Boxes, group: "Operación" },
  { label: "Proveedores", href: "/proveedores", icon: Truck, group: "Operación" },
  { label: "Comparar precios", href: "/comparar-precios", icon: Tags, group: "Operación" },
  { label: "Clientes", href: "/clientes", icon: Users, group: "Gestión" },
  { label: "Reportes", href: "/reportes", icon: BarChart3, group: "Gestión" },
  { label: "DTE y facturación", href: "/dte", icon: FileText, group: "Gestión" },
  { label: "Precio sugerido", href: "/precio-sugerido", icon: HandCoins, group: "Gestión" },
] as const;
export function Sidebar() {
  const pathname = usePathname();
  const groups = ["Principal", "Operación", "Gestión"];
  return (
    <aside className="flex min-h-screen w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0 md:px-5">
      <Link href="/" prefetch={false} className="mb-8 flex items-center gap-3 px-2">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Package className="size-5" />
        </span>
        <span>
          <span className="block text-[15px] font-bold tracking-tight">Buen Negocio</span>
          <span className="block text-xs text-muted-foreground">Tu operación, en orden</span>
        </span>
      </Link>
      <nav className="grid grid-cols-2 gap-x-2 gap-y-4 md:block md:flex-1" aria-label="Navegación principal">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <p className="mb-2 hidden px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground md:block">{group}</p>
            <div className="space-y-1">
              {links.filter((link) => link.group === group).map(({ label, href, icon: Icon }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
                return (
                  <Link key={href} href={href} prefetch={false} className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
                    active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}>
                    <Icon className="size-[17px] shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <Link href="/asistente" prefetch={false} data-beon-modulo="asistente" className="mt-2 flex items-center gap-3 rounded-xl border border-sidebar-border bg-white/60 px-3 py-3 text-sm font-semibold text-sidebar-foreground transition hover:bg-white md:mt-auto">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>
        <span>Asistente IA</span>
      </Link>
    </aside>
  );
}
