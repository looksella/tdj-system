"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  Home,
  Menu,
  Package,
  Scale,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  UserCog,
  Users,
  Vault,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { isAllowed } from "@/lib/auth-helpers";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
};

const navigationSections: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: "ventas",
    label: "Ventas",
    items: [
      { id: "inicio", label: "Inicio", href: "/", icon: Home, permission: "dashboard:read" },
      { id: "punto-de-venta", label: "Punto de venta", href: "/ventas", icon: Store, permission: "pos:read" },
      { id: "caja", label: "Caja", href: "/caja", icon: Vault, permission: "cash:operate" },
      { id: "clientes", label: "Clientes", href: "/clientes", icon: Users, permission: "customers:manage" },
      { id: "dte", label: "DTE y facturación", href: "/dte", icon: FileText, permission: "business:manage" },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    items: [
      { id: "inventario", label: "Inventario", href: "/inventario", icon: Package, permission: "inventory:read" },
      { id: "comparar-precios", label: "Comparar precios", href: "/comparar-precios", icon: Scale, permission: "prices:manage" },
      { id: "precio-sugerido", label: "Precio sugerido", href: "/precio-sugerido", icon: Tag, permission: "business:manage" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    items: [
      { id: "compras", label: "Compras", href: "/compras", icon: ShoppingCart, permission: "purchases:manage" },
      { id: "proveedores", label: "Proveedores", href: "/proveedores", icon: Truck, permission: "suppliers:manage" },
    ],
  },
  {
    id: "equipo",
    label: "Equipo",
    items: [
      { id: "usuarios", label: "Usuarios", href: "/admin/usuarios", icon: UserCog, permission: "users:manage" },
      { id: "asistencia", label: "Asistencia", href: "/asistencia", icon: Clock3, permission: "attendance:punch" },
      { id: "planilla", label: "Planilla", href: "/planilla", icon: ClipboardList, permission: "payroll:manage" },
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    items: [
      { id: "reportes", label: "Reportes", href: "/reportes", icon: BarChart3, permission: "reports:read" },
    ],
  },
];

const allItems = navigationSections.flatMap((section) => section.items);
const itemIds = new Set(allItems.map((item) => item.id));
const initialFavorites = ["punto-de-venta", "caja", "inventario"];
const favoritesStorageKey = "tdj-sidebar-favorites";

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function getSectionForPath(pathname: string) {
  return navigationSections.find((section) =>
    section.items.some((item) => isActivePath(pathname, item.href)),
  )?.id ?? null;
}

function SidebarPanel({
  role,
  pathname,
  activeSection,
  onSectionChange,
  favorites,
  onFavoriteToggle,
  isEditingFavorites,
  onEditingFavoritesChange,
  onNavigate,
  closeButton,
  variant,
}: {
  role: string;
  pathname: string;
  activeSection: string | null;
  onSectionChange: (section: string | null) => void;
  favorites: string[];
  onFavoriteToggle: (id: string) => void;
  isEditingFavorites: boolean;
  onEditingFavoritesChange: () => void;
  onNavigate: () => void;
  closeButton?: ReactNode;
  variant: "desktop" | "mobile";
}) {
  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAllowed(role, item.permission)),
    }))
    .filter((section) => section.items.length > 0);
  const favoriteItems = favorites
    .map((id) => allItems.find((item) => item.id === id))
    .filter((item): item is NavItem => Boolean(item && isAllowed(role, item.permission)));

  function renderItems(items: NavItem[], sectionId: string, isOpen: boolean) {
    return items.map(({ id, label, href, icon: Icon }, index) => {
      const active = isActivePath(pathname, href);
      return (
        <div
          key={`${sectionId}-${id}`}
          className="flex items-center"
        >
          <Link
            href={href}
            prefetch={false}
            onClick={onNavigate}
            tabIndex={isOpen ? 0 : -1}
            aria-current={active ? "page" : undefined}
            style={{ transitionDelay: `${index * 50}ms` }}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-l-lg border-l-2 px-3 py-2 text-[13px] transition-all duration-200",
              active
                ? "border-primary bg-primary/15 font-semibold text-primary"
                : "border-transparent font-medium text-sidebar-foreground/80 hover:border-primary hover:bg-primary/10 hover:text-primary",
              isOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              isEditingFavorites && "rounded-r-none",
            )}
          >
            <Icon className="size-[17px] shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Link>
          {isEditingFavorites && (
            <button
              type="button"
              onClick={() => onFavoriteToggle(id)}
              tabIndex={isOpen ? 0 : -1}
              aria-label={favorites.includes(id) ? `Quitar ${label} de favoritos` : `Agregar ${label} a favoritos`}
              aria-pressed={favorites.includes(id)}
              style={{ transitionDelay: `${index * 50}ms` }}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              <Star className={cn("size-4", favorites.includes(id) && "fill-amber-400 text-amber-500")} />
            </button>
          )}
        </div>
      );
    });
  }

  function renderSection(
    id: string,
    label: string,
    items: NavItem[],
    isFavoriteSection = false,
  ) {
    const isOpen = activeSection === id;
    const sectionPanelId = `${variant}-sidebar-section-${id}`;
    return (
      <section
        key={id}
        className={cn(
          "rounded-xl p-1 transition-colors",
          isFavoriteSection && "border border-amber-300/50 bg-amber-100/45 dark:border-amber-300/15 dark:bg-amber-300/5",
        )}
      >
        <div className="flex items-center">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={sectionPanelId}
            onClick={() => onSectionChange(isOpen ? null : id)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <span className="flex min-w-0 items-center gap-2">
              {isFavoriteSection && <Star className="size-3.5 shrink-0 fill-amber-500 text-amber-600" aria-hidden="true" />}
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown
              className={cn("size-4 shrink-0 transition-transform duration-300", isOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {isFavoriteSection && (
            <button
              type="button"
              onClick={onEditingFavoritesChange}
              aria-pressed={isEditingFavorites}
              className="mr-2 rounded-md px-2 py-1 text-[11px] font-semibold text-amber-800/80 transition-colors hover:bg-amber-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-200"
            >
              {isEditingFavorites ? "Listo" : "Editar"}
            </button>
          )}
        </div>
        <div
          id={sectionPanelId}
          aria-hidden={!isOpen}
          className={cn(
            "grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-0.5 pb-1 pl-1">
              {items.length > 0 ? (
                renderItems(items, id, isOpen)
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {isEditingFavorites ? "Marca una estrella para agregar accesos." : "Aún no tienes accesos favoritos."}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:px-5">
      <div className="mb-5 flex shrink-0 items-center gap-3 px-2">
        <Link
          href={isAllowed(role, "dashboard:read") ? "/" : "/ventas"}
          prefetch={false}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Package className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold tracking-tight">Tienda Don Juan</span>
            <span className="block text-xs text-muted-foreground">Tu operación, en orden</span>
          </span>
        </Link>
        {closeButton}
      </div>

      <nav
        aria-label="Navegación principal"
        className="sidebar-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
      >
        {renderSection("favoritos", "Favoritos", favoriteItems, true)}
        {visibleSections.map((section) =>
          renderSection(section.id, section.label, section.items),
        )}
      </nav>

      {isAllowed(role, "assistant:access") && (
        <Link
          href="/asistente"
          prefetch={false}
          onClick={onNavigate}
          data-beon-modulo="asistente"
          className="mt-4 flex min-h-12 shrink-0 items-center gap-3 rounded-xl border border-sidebar-border bg-white/60 px-3 py-2 text-sm font-semibold text-sidebar-foreground transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/5 dark:hover:bg-white/10"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <span>Asistente IA</span>
        </Link>
      )}
    </div>
  );
}

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<string | null>(() =>
    getSectionForPath(pathname),
  );
  const [favorites, setFavorites] = useState(initialFavorites);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [isEditingFavorites, setIsEditingFavorites] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const storedFavorites = window.localStorage.getItem(favoritesStorageKey);
    if (storedFavorites) {
      try {
        const parsed: unknown = JSON.parse(storedFavorites);
        if (
          Array.isArray(parsed) &&
          parsed.every((id): id is string => typeof id === "string" && itemIds.has(id))
        ) {
          setFavorites([...new Set(parsed)]);
        } else {
          console.error("No se pudieron cargar los favoritos: el formato guardado no es válido.");
        }
      } catch (error) {
        console.error("No se pudieron leer los favoritos guardados.", error);
      }
    }
    setFavoritesLoaded(true);
  }, []);

  useEffect(() => {
    setActiveSection(getSectionForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    if (favoritesLoaded) {
      window.localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites));
    }
  }, [favorites, favoritesLoaded]);

  function toggleFavorite(id: string) {
    setFavorites((current) =>
      current.includes(id) ? current.filter((favorite) => favorite !== id) : [...current, id],
    );
  }

  const panelProps = {
    role,
    pathname,
    activeSection,
    onSectionChange: setActiveSection,
    favorites,
    onFavoriteToggle: toggleFavorite,
    isEditingFavorites,
    onEditingFavoritesChange: () => setIsEditingFavorites((editing) => !editing),
    onNavigate: () => setMobileOpen(false),
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border md:flex">
        <SidebarPanel {...panelProps} variant="desktop" />
      </aside>

      <div className="flex min-h-16 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-2 text-sidebar-foreground md:hidden">
        <Link
          href={isAllowed(role, "dashboard:read") ? "/" : "/ventas"}
          prefetch={false}
          className="flex items-center gap-2.5"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="size-[18px]" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight">Tienda Don Juan</span>
            <span className="block text-[11px] text-muted-foreground">Tu operación, en orden</span>
          </span>
        </Link>
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen} direction="left">
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menú de navegación">
              <Menu className="size-5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-dvh max-h-dvh w-[min(20rem,85vw)] rounded-none border-r border-sidebar-border p-0">
            <DrawerTitle className="sr-only">Menú de navegación</DrawerTitle>
            <SidebarPanel
              {...panelProps}
              variant="mobile"
              closeButton={
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Cerrar menú de navegación">
                    <X className="size-4" />
                  </Button>
                </DrawerClose>
              }
            />
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
