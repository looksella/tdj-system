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
    <main className="relative grid min-h-[100svh] w-full place-items-center px-4 py-10 sm:py-12">
      <AuthBackdrop />
      <ThemeToggle />

      <div className="tdj-glow relative z-10 w-full max-w-md rounded-3xl shadow-[0_36px_80px_-32px_rgba(4,18,12,0.6)]">
        <div className="rounded-[calc(1.5rem-1.5px)] border border-white/60 bg-white/90 p-6 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-slate-950/85">
          <div className="mx-auto mb-3 h-28 w-24 sm:h-32 sm:w-28">
            <Image
              src="/don-juan-mascota.png"
              alt="Don Juan, mascota de la tienda"
              width={1024}
              height={1536}
              priority
              className="h-full w-full object-contain drop-shadow-lg"
            />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
