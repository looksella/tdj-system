import { LoginInactivo } from "@/components/auth/login-inactivo";
import { SignInForm } from "@/components/auth/sign-in-form";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";

const TITULO_BIENVENIDA = "Bienvenido al Sistema de la Tienda Don Juan";

function rutaInterna(valor: string | undefined): string | null {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) {
    return null;
  }

  try {
    const url = new URL(valor, "https://ruta-interna.invalid");
    if (url.origin !== "https://ruta-interna.invalid" || url.pathname === "/sign-in") {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  if (!LOGIN_ACTIVO) {
    return <LoginInactivo titulo={TITULO_BIENVENIDA} />;
  }

  const params = await searchParams;
  const redirectParam = Array.isArray(params.redirect_url)
    ? params.redirect_url[0]
    : params.redirect_url;

  return <SignInForm redirectUrl={rutaInterna(redirectParam)} />;
}
export const metadata = { title: "Iniciar sesión" };
