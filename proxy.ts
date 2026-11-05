import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isInvalidRefreshToken, isSupabaseSessionCookie } from "@/lib/supabase/refresh-token";
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

function origenConfigurado(valor: string | undefined): URL | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function crearCsp(nonce: string): string {
  const supabase = origenConfigurado(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const logo = origenConfigurado(process.env.NEXT_PUBLIC_APP_LOGO_URL);
  const conexiones = ["'self'"];
  const imagenes = ["'self'", "data:", "blob:"];

  if (supabase) {
    conexiones.push(supabase.origin);
    conexiones.push(`${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`);
    imagenes.push(supabase.origin);
  }
  if (logo) imagenes.push(logo.origin);

  const scripts = ["'self'", `'nonce-${nonce}'`];
  if (process.env.NODE_ENV !== "production") scripts.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imagenes.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${conexiones.join(" ")}`,
    "frame-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function rutaEscanerMovil(pathname: string): boolean {
  return pathname === "/escaner-movil" || pathname.startsWith("/escaner-movil/");
}

function redirigirAlInicioDeSesion(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = `?redirect_url=${encodeURIComponent(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  )}`;
  return NextResponse.redirect(url);
}

function agregarHeadersDeSeguridad(
  response: NextResponse,
  csp: string,
  pathname: string,
): NextResponse {
  const scannerRoute = rutaEscanerMovil(pathname);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Referrer-Policy",
    scannerRoute ? "no-referrer" : "strict-origin-when-cross-origin",
  );
  response.headers.set(
    "Permissions-Policy",
    `camera=${scannerRoute ? "(self)" : "()"}, microphone=(), geolocation=()`,
  );
  response.headers.set("X-XSS-Protection", "0");
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = crearCsp(nonce);
  const crearHeadersDeRequest = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return headers;
  };
  const isPublicPath = coincideConAlguna(request.nextUrl.pathname, PUBLIC_PATHS);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublicPath) {
      return agregarHeadersDeSeguridad(
        NextResponse.next({ request: { headers: crearHeadersDeRequest() } }),
        csp,
        request.nextUrl.pathname,
      );
    }
    return agregarHeadersDeSeguridad(
      redirigirAlInicioDeSesion(request),
      csp,
      request.nextUrl.pathname,
    );
  }
  // Supabase refresca la sesión y redirige si no hay usuario.
  let supabaseResponse = NextResponse.next({ request: { headers: crearHeadersDeRequest() } });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // Re-asignar para que las cookies refrescadas viajen al browser.
        supabaseResponse = NextResponse.next({
          request: { headers: crearHeadersDeRequest() },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });
  // getUser() y no getSession(): verifica el JWT contra Supabase.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (isInvalidRefreshToken(error)) {
    const response = isPublicPath ? supabaseResponse : redirigirAlInicioDeSesion(request);
    for (const { name } of request.cookies.getAll()) {
      if (isSupabaseSessionCookie(name)) {
        response.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
        });
      }
    }
    return agregarHeadersDeSeguridad(response, csp, request.nextUrl.pathname);
  }
  if (!user && !isPublicPath) {
    return agregarHeadersDeSeguridad(
      redirigirAlInicioDeSesion(request),
      csp,
      request.nextUrl.pathname,
    );
  }
  // SIEMPRE `supabaseResponse`, nunca un `NextResponse.next()` nuevo: si no,
  // las cookies refrescadas se pierden y la sesión se cae sola.
  return agregarHeadersDeSeguridad(supabaseResponse, csp, request.nextUrl.pathname);
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
