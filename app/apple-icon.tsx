// iOS home-screen icon. It uses the configured logo or the app initials.
import { ImageResponse } from "next/og";
const SIZE = { width: 180, height: 180 };
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
/** Un solo ícono, en /apple-icon/<versión> (ver versionDelIcono). */
export function generateImageMetadata() {
  return [{ id: versionDelIcono(), size: SIZE, contentType: "image/png" }];
}
/** Mirrors the icon metadata because Next treats each icon route independently. */
function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
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
export default async function AppleIcon() {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Mi sistema";
  const themeColor = process.env.NEXT_PUBLIC_APP_THEME_COLOR || "#0074E8";
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
          fontSize: 96,
          fontWeight: 700,
          letterSpacing: "-0.05em",
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={Math.round(180 * 0.7)}
            height={Math.round(180 * 0.7)}
            style={{ objectFit: "contain" }}
          />
        ) : (
          initials(name)
        )}
      </div>
    ),
    { ...SIZE },
  );
}