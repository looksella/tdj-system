import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
/**
 * Sandbox de prueba de TuSistema. Server-only, NUNCA con prefijo
 * `NEXT_PUBLIC_`: con el prefijo queda en el bundle del cliente y cualquiera
 * podría bypassear la auth en producción.
 */
const IS_SANDBOX_DEV = process.env.BEON_SANDBOX_DEV === "1";
/**
 * El sistema se sirve ABIERTO: cualquiera con el link entra, y entra como el
 * dueño. La plataforma pone esta variable en `open` cuando el plan del dueño
 * termina — el login viene con el plan, y cuando el plan se termina el sistema
 * queda como uno del plan gratis. Los usuarios y sus contraseñas quedan
 * guardados: al volver, la variable vuelve a `on` y el login con ellos.
 *
 * Server-only y sin prefijo `NEXT_PUBLIC_`, por lo mismo que la de arriba.
 */
const AUTH_ABIERTO = process.env.BEON_AUTH_MODE === "open";
/** Las pantallas de sesión no tienen sentido con el sistema abierto: no hay a
 *  quién autenticar y el formulario dejaría pensar que la app es privada. */
const RUTAS_DE_SESION = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/setup",
];
/* @tusistema:PUBLIC_PATHS:start */
/**
 * Rutas que no piden sesión. Arranca SOLO con las de auth y los tres archivos
 * de la PWA: el default es "todo protegido", y abrir una ruta al público es
 * una decisión explícita.
 *
 * Si tu sistema tiene pantallas públicas de verdad (un catálogo, una landing,
 * una página de reservas para clientes), agregalas acá.
 *
 * `/sign-up` NO está: el dueño eligió "solo por invitación".
 */
const PUBLIC_PATHS = [
  "/sign-in",
  "/forgot-password",
  "/reset-password",
  "/setup",
  "/auth/callback",
  "/auth/confirm",
  "/api/admin/bootstrap",
  "/auth/acceso",
  "/auth/confirmar",
  // WhatsApp: Twilio entrega los mensajes en `webhook` sin sesión (la
  // ruta valida la firma de Twilio); `visible` no mira la sesión porque
  // la pide el runtime antes de saber quién mira.
  "/api/beon/whatsapp/webhook",
  "/api/beon/whatsapp/visible",
  // PWA: el navegador pide estos archivos SIN cookie de sesión. Detrás del
  // redirect a /sign-in el service worker nunca se registra, la pantalla
  // sin conexión nunca se cachea y el ícono sale roto (el `matcher` de
  // abajo no los excluye, así que esta lista es lo único que los deja pasar).
  "/sw.js",
  "/manifest.webmanifest",
  "/offline",
  "/icon",
  "/apple-icon",
];
/* @tusistema:PUBLIC_PATHS:end */
/**
 * ¿Esta ruta está en la lista? La usan `PUBLIC_PATHS` y `RUTAS_DE_SESION`.
 *
 * Match EXACTO o por SEGMENTO, nunca `startsWith` pelado: con `startsWith`,
 * tener `/setup` en `PUBLIC_PATHS` dejaba pública también
 * `/setup-cualquier-cosa` —y `/sign-in` abría `/sign-interno`—, o sea un
 * bypass de auth que se conseguía escribiendo una ruta con el prefijo justo.
 * Con el sistema abierto, el mismo prefijo mandaba al inicio una pantalla del
 * negocio que solo empezaba igual que una de sesión. Acá `/setup` cubre
 * `/setup` y `/setup/lo-que-sea`, y nada más.
 *
 * `"/"` en la lista cubre SOLO el home, no el sistema entero.
 */
function coincideConAlguna(pathname: string, rutas: string[]): boolean {
  return rutas.some((p) => {
    if (p === "/") return pathname === "/";
    const base = p.endsWith("/") ? p.slice(0, -1) : p;
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}
export async function middleware(request: NextRequest) {
  // Las tres capas van EN ESTE ORDEN. Cambiarlo rompe el sandbox de prueba o
  // deja deploys parciales sin protección.
  // 1. Sandbox de prueba: el dueño navega libre dentro del iframe del chat.
  if (IS_SANDBOX_DEV) return NextResponse.next({ request });
  // 1-bis. Sistema abierto (el plan del dueño terminó): pasa todo el mundo,
  //        igual que el sandbox. Las pantallas de sesión van al inicio.
  if (AUTH_ABIERTO) {
    if (coincideConAlguna(request.nextUrl.pathname, RUTAS_DE_SESION)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
  const isPublicPath = coincideConAlguna(request.nextUrl.pathname, PUBLIC_PATHS);
  // 2. Env guard FAIL-CLOSED, y esto no es negociable. Sin las env vars de
  //    Supabase no se puede verificar la sesión, así que NO se deja pasar.
  //    Antes esta capa devolvía `NextResponse.next()`, y por eso un deploy al
  //    que no llegaron las variables servía el sistema entero sin candado, sin
  //    un solo error en los logs.
  //
  //    Se responde 503 y no un redirect a /sign-in a propósito: sin
  //    configuración esa pantalla tampoco puede autenticar, así que mandarlo
  //    ahí es un loop. El `no-store` evita que el CDN cachee el 503 y deje la
  //    app caída después de que las variables llegan.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Auth horneada por la plataforma y todavía no activada (sin plan, o el
    // provisioning no corrió): el sistema queda ABIERTO, exactamente como un
    // sistema sin login. El candado aparece solo cuando llegan las variables.
    return NextResponse.next({ request });
  }
  // 3. Supabase real: refresca la sesión y redirige si no hay usuario.
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Re-asignar para que las cookies refrescadas viajen al browser.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  // getUser() y no getSession(): verifica el JWT contra Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect_url", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  // SIEMPRE `supabaseResponse`, nunca un `NextResponse.next()` nuevo: si no,
  // las cookies refrescadas se pierden y la sesión se cae sola.
  return supabaseResponse;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
