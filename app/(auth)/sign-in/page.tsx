"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { at } from "@/lib/auth-textos";
import { LoginInactivo } from "@/components/auth/login-inactivo";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import { mapSupabaseLoginError } from "@/lib/supabase/invite-errors";
/**
 * El login de este sistema puede no estar activo todavía: la plataforma inyecta
 * las variables de Supabase recién al activarlo (hace falta un plan). Sin esta
 * guarda la pantalla quedaba esperando a `/api/admin/bootstrap`, que sin
 * variables tampoco puede contestar, y si llegaba a pintar el formulario
 * `createClient()` devolvía null: "La autenticación no está configurada en este
 * entorno", que no le dice nada a un dueño no técnico.
 *
 * El guard vive en un componente de afuera, con los hooks encerrados en
 * `SignInForm`: un early return antes de los `useState` rompe las reglas de
 * hooks de React aunque la condición sea una constante de build. Es el mismo
 * doble componente que usa `/setup`.
 */
export default function SignInPage() {
  if (!LOGIN_ACTIVO) {
    return <LoginInactivo titulo={at.signIn.titulo} />;
  }
  return <SignInForm />;
}
function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const router = useRouter();
  // El email de la cuenta de dueño que la plataforma acaba de crear viaja como
  // `?email=` ("Abrir mi sistema" en TuSistema): llega cargado. Por
  // `window.location` en un efecto y no `useSearchParams`, que en el App Router
  // pide un Suspense alrededor y sin él puede romper el build.
  useEffect(() => {
    const desdeLaPlataforma = new URLSearchParams(window.location.search).get("email");
    if (desdeLaPlataforma) setEmail(desdeLaPlataforma);
  }, []);
  // Cero usuarios → mandamos a /setup. El login solo tiene sentido con al
  // menos una cuenta creada.
  useEffect(() => {
    fetch("/api/admin/bootstrap")
      .then((r) => r.json())
      .then((d) => (d.available ? router.replace("/setup") : setCheckingSetup(false)))
      .catch(() => setCheckingSetup(false));
  }, [router]);
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(mapSupabaseLoginError(signInError.message, signInError.code));
      setLoading(false);
      return;
    }
    router.push("/");
    // refresh() para que el middleware lea la sesión nueva de la cookie.
    router.refresh();
  }
  // Evita el flash del form mientras verificamos si hay usuarios.
  if (checkingSetup) {
    return <p className="text-sm text-muted-foreground">{at.comun.cargando}</p>;
  }
  return (
    <form onSubmit={handleSignIn} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold text-center">{at.signIn.titulo}</h1>
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
      {/* @tusistema:SIGNUP_LINK:start */}
      {/* Sin registro abierto: el alta la hace el admin. */}
      {/* @tusistema:SIGNUP_LINK:end */}
    </form>
  );
}
