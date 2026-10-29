import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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
  "/auth/callback",
  "/auth/confirm",
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
/**
 * ¿Esta ruta está en la lista? La usa `PUBLIC_PATHS`.
 *
 * Match exacto o por segmento, nunca con un `startsWith` sin límite: por ejemplo,
 * `/sign-in` no debe abrir `/sign-interno`, o sea un
 * bypass de auth que se conseguía escribiendo una ruta con el prefijo justo.
 * Cada ruta de esta lista cubre su ruta exacta y sus subrutas, y nada más.
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
  const isPublicPath = coincideConAlguna(request.nextUrl.pathname, PUBLIC_PATHS);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublicPath) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("redirect_url", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  // Supabase refresca la sesión y redirige si no hay usuario.
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
