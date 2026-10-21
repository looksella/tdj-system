import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Cliente de browser. Nuevo en cada llamada: `createBrowserClient` maneja su
 * propio estado de sesión y un singleton mal inicializado queda stale.
 *
 * Devuelve `null` si faltan las env vars públicas (sandbox de prueba o preview
 * parcial) — espeja la capa 2 del middleware. Sin este guard,
 * `createBrowserClient` tira "Your project's URL and API key are required" y
 * crashea el iframe del chat.
 *
 * OBLIGATORIO: todo consumidor null-checkea antes de tocar `.auth`.
 *   const supabase = createClient(); if (!supabase) return;
 */
export const createClient = (): SupabaseClient | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? createBrowserClient(url, anonKey) : null;
};
