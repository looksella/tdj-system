/** Business language shared by server-rendered and client-rendered copy. */
export type Idioma = "es" | "pt";
/** El idioma del negocio. Nunca lanza: sin señal, castellano. */
export function idiomaDelNegocio(): Idioma {
  // Use the business locale when configured.
  const declarado = process.env.NEXT_PUBLIC_BEON_LOCALE;
  if (declarado === "pt" || declarado === "es") return declarado;
  // Otherwise infer Portuguese from the browser when available.
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("pt")
  ) {
    return "pt";
  }
  // Spanish is the default locale.
  return "es";
}
/**
 * Elige el pack del idioma activo.
 *
 * `Record<Idioma, T>` obliga por tipos a que `pt` tenga TODO lo que tiene `es`:
 * una clave que falte no compila, y el CI de sistemas base buildea las apps de
 * verdad, así que no llega a producción.
 */
export function packDeTextos<T>(packs: Record<Idioma, T>): T {
  return packs[idiomaDelNegocio()];
}
/**
 * Locale BCP-47 del negocio, para `Intl` (fechas, moneda, ordenamientos).
 *
 * Sale del PAÍS, no del idioma. Derivarlo del idioma (`es` -> `es-AR`) le daba
 * formato argentino a México, Colombia y Perú, que es justo lo que el locale
 * tiene que distinguir: `1.234,56` contra `1,234.56`.
 *
 * Set `NEXT_PUBLIC_BEON_COUNTRY_LOCALE` to override the locale for dates,
 * currency, and sorting.
 */
export function localeDelNegocio(): string {
  const declarado = process.env.NEXT_PUBLIC_BEON_COUNTRY_LOCALE;
  if (declarado && /^[a-z]{2}-[A-Z]{2}$/.test(declarado)) return declarado;
  return idiomaDelNegocio() === "pt" ? "pt-BR" : "es-AR";
}
