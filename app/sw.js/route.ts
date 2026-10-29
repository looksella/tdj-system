// Serves the PWA service worker with a cache name tied to each deploy.
//
// A route handler is used instead of public/sw.js because the cache name must
// incluir el id del deploy para que cada deploy invalide el cache anterior
// solo. Un archivo estático en public/ no puede leer env vars, así que el
// cache quedaría fijo y el usuario se quedaría pegado a una versión vieja
// del shell. Servido desde acá, el contenido del SW cambia byte-a-byte en
// cada deploy → el browser detecta un SW nuevo y descarta el viejo.
//
// Cache rules:
//   - Nunca se cachea una respuesta de navegación: puede tener datos de
//     sesión, y un dispositivo compartido (el iPad del mostrador) los
//     mostraría al siguiente usuario.
//   - Nunca se cachea /auth/* ni /api/*.
//   - Todo lo que no sea GET pasa derecho a la red.
export const dynamic = "force-dynamic";
export function GET() {
  const build =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "dev";
  const body = `// service worker generado — build ${build}
const CACHE = "app-${build}";
const OFFLINE_URL = "/offline";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Bypass total de todo lo que no sea un GET del mismo origen.
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Bypass de los paths sensibles. Cachear una respuesta autenticada sería
  // una fuga de datos entre usuarios en un dispositivo compartido.
  if (url.pathname === "/sw.js") return;
  if (url.pathname.startsWith("/auth")) return;
  if (url.pathname.startsWith("/api")) return;
  // Navegaciones: network-first y NUNCA se guardan en cache. Sin red, la
  // pantalla de offline (que sí está cacheada, y es estática).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit || Response.error())
      )
    );
    return;
  }
  // Assets inmutables del build (llevan hash en el nombre) e iconos
  // generados: cache-first, son los únicos seguros de guardar.
  const cacheable =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.startsWith("/apple-icon");
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    })
  );
});
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // El SW no se cachea: es el archivo que decide qué se cachea.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}