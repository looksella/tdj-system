// Inyectado por el pipeline de TuSistema.AI. Genera los iconos de la PWA.
// NO modificar — sobreescrito automáticamente en cada iteración.
//
// Los tres tamaños se generan on-demand con ImageResponse (el motor de
// next/og, que ya viene con Next) a partir del logo o de las iniciales del
// nombre, y el color de marca. Elegido así a propósito: sin pipeline de
// imágenes, sin blob storage, sin assets binarios en el repo del cliente y
// sin una llamada a un modelo de imágenes por proyecto. Costo de infra: cero.
//
// Convención de archivo del App Router: Next expone /icon/<id> por cada id
// de generateImageMetadata e inyecta los <link rel="icon"> sin tocar
// app/layout.tsx. El id es `<variante>-<versión>` (ver versionDelIcono):
// 0 = 192, 1 = 512, 2 = 512 maskable.
import { ImageResponse } from "next/og";
/**
 * La versión del ícono: un hash corto de lo que dibuja (nombre, color y logo).
 *
 * Va en la dirección del ícono. Next sirve estas imágenes como inmutables por
 * un año, y el service worker de la app también las guarda para siempre: con
 * la dirección fija, quien ya había entrado seguía viendo el ícono viejo
 * aunque el dueño cambiara el nombre, el color o la imagen, incluso borrando y
 * volviendo a agregar el acceso directo. Con la versión en la dirección, un
 * cambio es otra dirección y el teléfono la pide de cero.
 *
 * La misma función vive en app/icon.tsx, app/apple-icon.tsx y app/manifest.ts
 * (duplicada a propósito, como `initials`): un cambio en una va a las tres.
 */
function versionDelIcono(): string {
  const fuente = [
    process.env.NEXT_PUBLIC_APP_NAME || "",
    process.env.NEXT_PUBLIC_APP_THEME_COLOR || "",
    process.env.NEXT_PUBLIC_APP_LOGO_URL || "",
  ].join("|");
  // FNV-1a de 32 bits: estable entre builds y sin dependencias.
  let h = 0x811c9dc5;
  for (let i = 0; i < fuente.length; i++) {
    h ^= fuente.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
export function generateImageMetadata() {
  const v = versionDelIcono();
  return [
    { id: `0-${v}`, size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: `1-${v}`, size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: `2-${v}`, size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}
/** Hasta dos iniciales del nombre del negocio. Tolera nombres raros. */
function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    // Descarta conectores y cualquier token que no arranque con letra o
    // dígito (emojis, guiones, comillas), que darían una inicial ilegible.
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .filter((w) => !["de", "del", "la", "el", "los", "las", "y"].includes(w.toLowerCase()));
  if (words.length === 0) return "MS";
  if (words.length === 1) {
    return [...words[0]].slice(0, 2).join("").toUpperCase();
  }
  return ([...words[0]][0] + [...words[1]][0]).toUpperCase();
}
/**
 * El logo del dueño como data URI, o null.
 *
 * Se descarga ACÁ en vez de pasarle la URL a un <img> dentro del
 * ImageResponse, por una razón concreta: Satori (el motor de next/og)
 * resuelve las imágenes remotas mientras renderiza, y un fetch que falla ahí
 * ya no se puede atrapar — el icono sale roto, no sale la inicial. Trayéndolo
 * antes, cualquier problema es un `null` y el camino de las iniciales sigue.
 *
 * SVG queda AFUERA a propósito: Satori no lo rasteriza dentro de un <img> de
 * forma confiable, y un logo que a veces sale y a veces no es peor que una
 * inicial que sale siempre. El brand kit guarda SVG tal cual y todo lo demás
 * normalizado a PNG, así que la mayoría de los logos entra igual.
 */
async function logoDataUri(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_APP_LOGO_URL;
  if (!url) return null;
  const ACEPTADOS = ["image/png", "image/jpeg", "image/webp"];
  const MAX_BYTES = 1_000_000;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const tipo = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!ACEPTADOS.includes(tipo)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    return `data:${tipo};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    // Timeout, DNS, 5xx, un blob borrado: todo cae a la inicial.
    return null;
  }
}
export default async function Icon({ id }: { id: string }) {
  const variante = String(id).split("-")[0];
  const maskable = variante === "2";
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Mi sistema";
  // El default es el azul de la plataforma, NO un negro neutro: es lo que ve
  // un proyecto sin marca, y un cuadrado negro con dos letras no se parece a
  // un producto. La var la inyecta el deploy pipeline cuando la conoce.
  const themeColor = process.env.NEXT_PUBLIC_APP_THEME_COLOR || "#0074E8";
  const size = variante === "0" ? 192 : 512;
  // El icono maskable (id 2) lo recorta el sistema operativo hasta un 20%
  // de cada borde, así que el contenido tiene que vivir en el 60% central
  // (safe zone del spec). Por eso la tipografía va más chica ahí.
  const fontScale = maskable ? 0.42 : 0.55;
  const logo = await logoDataUri();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: themeColor,
          color: "#ffffff",
          fontSize: Math.round(size * fontScale),
          fontWeight: 700,
          letterSpacing: "-0.05em",
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={Math.round(size * (maskable ? 0.55 : 0.7))}
            height={Math.round(size * (maskable ? 0.55 : 0.7))}
            style={{ objectFit: "contain" }}
          />
        ) : (
          initials(name)
        )}
      </div>
    ),
    { width: size, height: size },
  );
}
