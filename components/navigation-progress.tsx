// manifest: Barra de progreso de navegación (3px, top, bg-primary). Montala vos en el `app/layout.tsx` que creás (no viene en el workdir). NO crees loading.tsx ni skeletons.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
/**
 * Feedback de navegación de la app generada.
 *
 * Hereda la paleta del proyecto vía `bg-primary`: cambiar `--primary` en
 * `globals.css` cambia la barra, sin tocar este archivo.
 *
 * El guard `__beonVeditActive` es la razón por la que este componente vive en
 * el scaffold y no lo escribe el agente: es un flag que setea el editor visual
 * de la plataforma, y sin él el progreso arranca al clickear en modo edición y
 * queda colgado para siempre.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPathname = useRef(pathname);
  const start = useCallback(() => {
    setVisible(true);
    setProgress(25);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + (90 - p) * 0.08));
    }, 150);
  }, []);
  const complete = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  }, []);
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      complete();
    }
  }, [pathname, complete]);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if ((window as unknown as { __beonVeditActive?: boolean }).__beonVeditActive) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href === pathname ||
        anchor.target === "_blank"
      ) {
        return;
      }
      start();
    };
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [pathname, start]);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] h-[3px]">
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transition:
            progress >= 100
              ? "width 200ms ease-out, opacity 250ms ease 100ms"
              : "width 150ms ease-out",
        }}
      />
    </div>
  );
}
