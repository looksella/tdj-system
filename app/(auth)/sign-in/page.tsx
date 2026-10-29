"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { at } from "@/lib/auth-textos";
import { LoginInactivo } from "@/components/auth/login-inactivo";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import { mapSupabaseLoginError } from "@/lib/supabase/invite-errors";
const TITULO_BIENVENIDA = "Bienvenido al Sistema de la Tienda Don Juan";
export default function SignInPage() {
  if (!LOGIN_ACTIVO) {
    return <LoginInactivo titulo={TITULO_BIENVENIDA} />;
  }
  return <SignInForm />;
}
function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError(at.comun.noConfigurado);
      setLoading(false);
      return;
    }
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(mapSupabaseLoginError(signInError.message, signInError.code));
      setLoading(false);
      return;
    }
    router.push(data.user.app_metadata?.role === "employee" ? "/ventas" : "/");
    // refresh() para que el middleware lea la sesión nueva de la cookie.
    router.refresh();
  }
  return (
    <form onSubmit={handleSignIn} className="w-full max-w-sm space-y-4">
      <h1 className="text-center text-2xl font-bold">
        {TITULO_BIENVENIDA}
      </h1>
      <p className="text-center text-sm text-muted-foreground">
        {at.signIn.titulo}
      </p>
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          {at.comun.email}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={at.comun.emailPlaceholder}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          {at.comun.password}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={at.comun.passwordPlaceholder}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? at.signIn.enviando : at.signIn.cta}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        <a href="/forgot-password" className="underline">
          {at.signIn.olvide}
        </a>
      </p>
    </form>
  );
}
