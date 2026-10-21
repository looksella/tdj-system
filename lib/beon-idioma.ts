/**
 * El idioma del NEGOCIO, para todo lo que la plataforma pone dentro de la app.
 *
 * Por qué el del negocio y no el del visitante
 * -------------------------------------------
 * El login, los errores y los avisos no los lee el dueño: los leen sus
 * empleados y sus clientes. Resolver por `navigator.language` le mostraría
 * castellano al empleado brasileño que tiene el teléfono en inglés, y portugués
 * a un turista mirando un sistema argentino. El idioma lo declaró el dueño en
 * su brief y viaja como `NEXT_PUBLIC_BEON_LOCALE`.
 *
 * `process.env.NEXT_PUBLIC_*` lo inlinea Next en build time, así que esto
 * funciona igual en Server Components, Client Components y route handlers —
 * que es exactamente lo que necesitan las pantallas de auth.
 *
 * Lo escribe la plataforma. El agente no lo edita: se restaura solo en el
 * commit siguiente.
 */
export type Idioma = "es" | "pt";
/** El idioma del negocio. Nunca lanza: sin señal, castellano. */
export function idiomaDelNegocio(): Idioma {
  // 1. Lo que declaró el dueño.
  const declarado = process.env.NEXT_PUBLIC_BEON_LOCALE;
  if (declarado === "pt" || declarado === "es") return declarado;
  // 2. Desempate: solo cuando el negocio no dijo nada (apps anteriores a que
  //    la plataforma inyectara la variable).
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("pt")
  ) {
    return "pt";
  }
  // 3. Fail-closed al comportamiento de siempre.
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
 * `NEXT_PUBLIC_BEON_COUNTRY_LOCALE` la inyecta la plataforma con el país del
 * brief, igual que la del idioma. Las apps publicadas antes de que existiera no
 * la tienen: ahí se cae al comportamiento de siempre, que es el de Argentina
 * para castellano. No es un fallback silencioso sino el default explícito de
 * una app que nació sin el dato.
 */
export function localeDelNegocio(): string {
  const declarado = process.env.NEXT_PUBLIC_BEON_COUNTRY_LOCALE;
  if (declarado && /^[a-z]{2}-[A-Z]{2}$/.test(declarado)) return declarado;
  return idiomaDelNegocio() === "pt" ? "pt-BR" : "es-AR";
}
