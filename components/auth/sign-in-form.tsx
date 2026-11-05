"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TituloBienvenida } from "@/components/auth/titulo-bienvenida";
import { Input } from "@/components/ui/input";
import { at } from "@/lib/auth-textos";
import { createClient } from "@/lib/supabase/client";
import { mapSupabaseLoginError } from "@/lib/supabase/invite-errors";

const MARQUEE = "TIENDA DON JUAN ✦ TIENDA DON JUAN ✦ TIENDA DON JUAN ✦ TIENDA DON JUAN ✦ ";

export function SignInForm({ redirectUrl }: { redirectUrl: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError(at.comun.noConfigurado);
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(mapSupabaseLoginError(signInError.message, signInError.code));
        return;
      }
      const defaultDestination = data.user.app_metadata?.role === "employee" ? "/ventas" : "/";
      router.push(redirectUrl ?? defaultDestination);
      router.refresh();
    } catch (signInFailure) {
      console.error("No se pudo completar el inicio de sesión.", signInFailure);
      setError(at.errores.loginGenerico);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <TituloBienvenida />
      <p className="text-center text-sm text-foreground/75">{at.signIn.titulo}</p>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          {at.comun.email}
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={at.comun.emailPlaceholder}
          required
          className="h-11 rounded-xl bg-white/75 px-3.5 text-base text-foreground shadow-sm placeholder:text-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35 md:text-sm dark:bg-white/5 dark:placeholder:text-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          {at.comun.password}
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={at.comun.passwordPlaceholder}
          required
          className="h-11 rounded-xl bg-white/75 px-3.5 text-base text-foreground shadow-sm placeholder:text-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35 md:text-sm dark:bg-white/5 dark:placeholder:text-foreground/50"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Contenedor con el mismo borde de luz que la tarjeta, pero de 3 s y
          visible solo en hover o con foco de teclado (ver globals.css). */}
      <div className="tdj-glow tdj-glow-boton rounded-xl">
        <button
          type="submit"
          disabled={loading}
          className="group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[calc(0.75rem-3px)] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-500 hover:bg-linear-to-r hover:from-emerald-950 hover:to-emerald-900 hover:text-emerald-50 focus-visible:bg-linear-to-r focus-visible:from-emerald-950 focus-visible:to-emerald-900 focus-visible:text-emerald-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden text-[10px] font-bold tracking-[0.35em] text-white/35 opacity-0 uppercase transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <span className="tdj-marquee absolute inset-y-0 left-0 flex w-full items-center whitespace-nowrap">
              {MARQUEE}
            </span>
            <span className="tdj-marquee absolute inset-y-0 left-full flex w-full items-center whitespace-nowrap">
              {MARQUEE}
            </span>
          </span>

          <span className="relative z-10 flex items-center justify-center gap-2">
            {loading && (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            )}
            <span>{loading ? at.signIn.enviando : at.signIn.cta}</span>
          </span>
        </button>
      </div>

      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="rounded-sm text-foreground/80 underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none"
        >
          {at.signIn.olvide}
        </Link>
      </p>
    </form>
  );
}
