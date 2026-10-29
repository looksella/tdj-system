// Web App Manifest for installable PWA support.
import type { MetadataRoute } from "next";
/** Trims the short name at word boundaries for the home-screen label. */
const CONECTORES = [
  "de", "del", "la", "el", "los", "las", "y", "a", "en", "con", "para",
];
const ARTICULOS = ["mi", "mis", "el", "la", "los", "las", "un", "una"];
function shortenName(name: string, limit = 12): string {
  if (name.length <= limit) return name;
  // Primero se descarta el artículo inicial: no aporta y ocupa el lugar de la
  // palabra que importa. Sin esto "Mi Ferreteria" salía "Mi".
  let base = name;
  const partes = name.split(" ").filter(Boolean);
  if (partes.length > 1 && ARTICULOS.includes(partes[0].toLowerCase())) {
    const sinArticulo = partes.slice(1).join(" ");
    if (sinArticulo.length <= limit) return sinArticulo;
    base = sinArticulo;
  }
  let out = "";
  for (const word of base.split(" ")) {
    const candidate = `${out} ${word}`.trim();
    if (candidate.length > limit) break;
    out = candidate;
  }
  // Descartar conectores colgando al final: "Rincon de Lectura" no puede
  // quedar como "Rincon de", que abajo del icono se lee como texto cortado.
  const palabras = out.split(" ").filter(Boolean);
  while (palabras.length && CONECTORES.includes(palabras[palabras.length - 1].toLowerCase())) {
    palabras.pop();
  }
  return palabras.join(" ") || base.slice(0, limit);
}
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
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Mi sistema";
  const shortName =
    process.env.NEXT_PUBLIC_APP_SHORT_NAME || shortenName(name);
  const themeColor = process.env.NEXT_PUBLIC_APP_THEME_COLOR || "#0074E8";
  const version = versionDelIcono();
  return {
    name,
    short_name: shortName,
    description: `Sistema de gestión de ${name}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    lang: "es",
    // Los paths salen de `generateImageMetadata` en app/icon.tsx: Next expone
    // UN path por id (/icon/0-<versión>, /icon/1-…, /icon/2-…), NO /icon
    // pelado — que devuelve 404. La versión es la misma que calcula icon.tsx.
    icons: [
      { src: `/icon/0-${version}`, sizes: "192x192", type: "image/png" },
      { src: `/icon/1-${version}`, sizes: "512x512", type: "image/png" },
      {
        src: `/icon/2-${version}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}