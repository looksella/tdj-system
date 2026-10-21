import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { at } from "../auth-textos";
import { LOGIN_ACTIVO } from "./estado";
/**
 * Cliente server-side ligado a las cookies del request. Usalo desde Server
 * Components, API routes y Server Actions.
 *
 * `await cookies()` es OBLIGATORIO: Next.js 15+ la volvió async y sin el await
 * revienta con un TypeError en runtime.
 */
export async function createServerClient() {
  // Con el login dormido (app publicada sin plan, sin env vars de Supabase)
  // la librería tiraría `supabaseUrl is required`. Esto lo convierte en una
  // frase legible en los logs de Vercel (la pantalla sigue siendo el
  // global-error genérico: Next la reemplaza por un digest). El camino sano
  // no cambia.
  if (!LOGIN_ACTIVO) throw new Error(at.comun.loginDormidoServidor);
  const cookieStore = await cookies();
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component, que es read-only sobre las
            // cookies. No es un error: el middleware ya refrescó la sesión
            // antes de llegar acá.
          }
        },
      },
    },
  );
}
