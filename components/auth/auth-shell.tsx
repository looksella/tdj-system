import Image from "next/image";
import { AuthBackdrop } from "@/components/auth/auth-backdrop";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Marco visual de la pantalla de login: fondo, mascota, botón de tema y la
 * tarjeta de vidrio con el borde de luz giratorio.
 *
 * Escritorio: mascota grande a la izquierda, alineada abajo, pisando apenas el
 * borde de la tarjeta (`-mr-10` + z-20). Menos de 1024 px: la mascota grande
 * desaparece y adentro de la tarjeta aparece la versión de 96 px.
 *
 * La sombra va en el contenedor `.tdj-glow` y no en la tarjeta de adentro,
 * porque `overflow: hidden` recortaría una sombra interna.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative w-full">
      <AuthBackdrop />
      <ThemeToggle />

      {/* `pt-16` en móvil deja libre la esquina del botón de tema. */}
      <div className="mx-auto flex w-full max-w-3xl items-end justify-center pt-16 lg:pt-0">
        <div className="pointer-events-none relative z-20 -mr-10 hidden h-[70vh] w-[clamp(220px,28vw,360px)] lg:block">
          <Image
            src="/don-juan-mascota.png"
            alt="Don Juan, mascota de la tienda"
            fill
            sizes="(min-width: 1024px) 28vw, 1px"
            className="object-contain object-bottom drop-shadow-[0_24px_38px_rgba(4,18,12,0.45)]"
          />
        </div>

        <div className="tdj-glow relative z-10 w-full max-w-md shadow-[0_36px_80px_-32px_rgba(4,18,12,0.6)]">
          <div className="rounded-[calc(1.5rem-1.5px)] border border-white/40 bg-white/80 p-6 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-slate-950/70">
            <div className="relative mx-auto mb-4 h-24 w-24 lg:hidden">
              <Image
                src="/don-juan-mascota.png"
                alt="Don Juan, mascota de la tienda"
                fill
                sizes="96px"
                className="object-contain object-bottom drop-shadow-lg"
              />
            </div>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
