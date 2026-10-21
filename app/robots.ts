// Inyectado por el pipeline de TuSistema.AI. Le dice a los buscadores y a los
// crawlers que no indexen ni recorran esta app.
// NO modificar — sobreescrito automáticamente en cada iteración.
//
// Por qué existe: las apps generadas viven en un subdominio público de
// tusistema.ai y son el sistema operativo de un negocio (turnos, stock,
// clientes), no un sitio para atraer visitas. Sin este archivo quedan abiertas
// a que cualquier crawler las recorra, y cada visita a una página que lee la
// base es una query sin caché contra la Neon del cliente: tráfico que el dueño
// no pidió y computo que pagamos nosotros.
//
// Es una convención de archivo del App Router: Next lo sirve en /robots.txt
// solo, sin que nadie tenga que editar app/layout.tsx. Misma razón por la que
// manifest.ts no necesita tocar el layout.
//
// Ojo con el alcance: robots.txt es una pedido, no una barrera. Frena al
// crawler que respeta el estándar (Google, Bing, la mayoría de los bots de
// IA), no al que decide ignorarlo. Contra ese último la herramienta es el
// firewall de Vercel o pedir login, no este archivo.
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}