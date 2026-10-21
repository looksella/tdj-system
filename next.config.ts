import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Las imágenes se sirven tal cual, sin el optimizador de Vercel. Motivo: en la
  // versión publicada `next/image` no baja la foto desde el navegador, la pide
  // el optimizador por su cuenta y SIN la sesión del usuario. Toda imagen que
  // salga de una ruta propia con login (`/api/.../foto`) o de una URL firmada
  // del bucket privado le responde al optimizador con un redirect al login o un
  // "hostname not configured", y la foto no aparece en producción aunque en el
  // modo prueba (login bypasseado) se vea perfecta. Caso real: 2026-09-16.
  // Las miniaturas se hacen en el navegador antes de subir; el optimizador no
  // aporta nada acá.
  images: { unoptimized: true },
  experimental: {
    // Los Server Actions cortan el body en 1 MB por default y Vercel corta las
    // funciones en 4,5 MB. Los ARCHIVOS no viajan por acá (suben directo al
    // bucket con lib/beon-storage-client.ts): esto solo evita que un
    // formulario con un adjunto chico muera en 1 MB. Subirlo más no sirve.
    serverActions: { bodySizeLimit: "4mb" },
  },
};
export default nextConfig;
