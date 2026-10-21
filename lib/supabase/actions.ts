"use server";
import { redirect } from "next/navigation";
import { LOGIN_ACTIVO } from "./estado";
import { createServerClient } from "./server";
/**
 * Cierre de sesión. Tiene que ser server-side: un `signOut()` desde el cliente
 * NO invalida las cookies de SSR, así que el middleware sigue viendo la sesión
 * y el usuario "cerró sesión" pero nunca salió.
 *
 * Llamala desde un form:
 *   <form action={signOut}><button type="submit">Salir</button></form>
 *
 * El redirect es lo que borra las cookies, vía el response del servidor.
 */
export async function signOut() {
  // En una app abierta (login dormido) no hay sesión que cerrar. Mandar a
  // `/sign-in` mostraría <LoginInactivo>, confuso para quien apretó "Salir".
  if (!LOGIN_ACTIVO) redirect("/");
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
