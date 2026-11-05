"use client";

import { Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  variant?: "floating" | "sidebar" | "icon";
};

const variantClasses: Record<NonNullable<ThemeToggleProps["variant"]>, string> = {
  floating:
    "fixed top-4 right-4 z-30 flex size-11 items-center justify-center rounded-full border border-white/50 bg-white/70 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none dark:border-white/15 dark:bg-slate-950/60 dark:text-amber-100 dark:hover:bg-slate-900/80",
  sidebar:
    "flex min-h-11 w-full shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  icon: "grid size-11 shrink-0 place-items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
};

export function ThemeToggle({ variant = "floating" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Cambiar tema claro u oscuro"
      title="Cambiar tema claro u oscuro"
      className={cn(variantClasses[variant])}
    >
      <Moon className="size-5 shrink-0" aria-hidden="true" />
      {variant === "sidebar" && <span>Cambiar tema</span>}
    </button>
  );
}
