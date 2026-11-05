"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Único punto donde se configura el tema de la app.
 *
 * La clase `dark` va en <html> porque Tailwind está configurado así en
 * `globals.css` (`@custom-variant dark (&:is(.dark *))`). Sin este proveedor,
 * `useTheme()` devuelve undefined y el botón del login no puede alternar nada.
 */
export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
