/**
 * Localización del sistema: moneda, formato de fecha y zona horaria.
 *
 * El bloque BEON:LOCALE de abajo lo escribe la plataforma al preparar el
 * proyecto, con el país del dueño. No lo edites a mano y no hornees un locale
 * ni una moneda en ningún componente: usá `formatMoney` y `formatDate`.
 *
 * Si el negocio opera en otro país del que dice acá, se cambia ACÁ, en un solo
 * lugar, no en cada pantalla.
 */
// PHONE_PREFIX: código telefónico del país sin "+" (Argentina "54"); vacío si
// el país no se conoce. Con él se arman los links wa.me y tel:, sin el 0
// nacional del número.
// ── BEON:LOCALE ── escrito por la plataforma al hidratar el workdir. No editar a mano.
export const LOCALE = "es-SV";
export const CURRENCY = "USD";
export const TIMEZONE = "America/El_Salvador";
export const LANG = "es";
export const PHONE_PREFIX = "503";
// ── /BEON:LOCALE ──
export const formatMoney = (n: number) =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 2,
  }).format(n);
export const formatDate = (
  d: Date | string,
  opts?: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(new Date(d));
export const formatDateTime = (d: Date | string) =>
  formatDate(d, { hour: "2-digit", minute: "2-digit" });
