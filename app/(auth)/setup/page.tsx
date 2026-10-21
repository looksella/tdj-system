"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { at } from "@/lib/auth-textos";
import { LoginInactivo } from "@/components/auth/login-inactivo";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import {
  mensajeDeBootstrap,
  passwordCumple,
  type CodigoBootstrap,
} from "@/lib/supabase/invite-errors";
type State = "checking" | "available" | "no_token" | "closed" | "done";
/**
 * Configuración inicial: crea la cuenta de dueño.
 *
 * El copy NO se cambia. En particular, `no_token` dice que falta PUBLICAR —
 * nunca que algo "se está configurando": un dueño estuvo horas esperando frente
 * a un mensaje que sugería que la pantalla iba a activarse sola. Vive en
 * `lib/auth-textos.ts` (pack `setup`) para que exista también en portugués: el
 * TEXTO castellano es el mismo de siempre, palabra por palabra.
 *
 * `useSearchParams()` OBLIGA a un <Suspense>: sin boundary, `npm run build`
 * falla con "useSearchParams() should be wrapped in a suspense boundary". No
 * simplifiques el doble componente.
 */
export default function SetupPage() {
  // Sin las variables de Supabase no hay cuenta de dueño que crear: el login
  // de este sistema todavía no está activo. Sin esta guarda la pantalla pedía
  // `/api/admin/bootstrap`, que sin variables tampoco puede contestar, y el
  // dueño quedaba mirando un "Cargando…" o —peor— el estado `closed`, que le
  // dice "la cuenta de administrador ya está creada" sobre un sistema que no
  // tiene ninguna.
  if (!LOGIN_ACTIVO) {
    return <LoginInactivo titulo={at.setup.titulo} />;
  }
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">{at.comun.cargando}</p>}
    >
      <SetupForm />
    </Suspense>
  );
}
function SetupForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/admin/bootstrap")
      .then((r) => r.json())
      .catch(() => ({ available: false }))
      .then((data) => {
        // Sin token no hay form: la clave viene en el link de TuSistema.
        if (data.available) setState(token ? "available" : "no_token");
        else setState("closed");
      })
      .catch(() => setState("closed"));
  }, [token]);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(at.setup.noCoinciden);
      return;
    }
    // Lo mismo que exige GoTrue, antes de llamarlo: si no, rechaza en inglés.
    if (!passwordCumple(password)) {
      setError(at.errores.passwordDebil);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, token }),
      });
      const data: { ok?: boolean; code?: CodigoBootstrap } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        // Se decide por `data.code`, nunca por `data.error`: el texto sale
        // del pack del idioma del negocio.
        setError(mensajeDeBootstrap(data.code));
        setSaving(false);
        return;
      }
      setState("done");
    } catch {
      setError(at.setup.errorGenerico);
      setSaving(false);
    }
  }
  if (state === "checking") {
    return <p className="text-sm text-muted-foreground">{at.comun.cargando}</p>;
  }
  if (state === "no_token") {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{at.setup.sinTokenTitulo}</h1>
        <p className="text-sm text-muted-foreground">
          {at.setup.sinTokenP1}
        </p>
        <p className="text-sm text-muted-foreground">
          {at.setup.sinTokenP2}
        </p>
      </div>
    );
  }
  if (state === "closed") {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{at.setup.cerradoTitulo}</h1>
        <p className="text-sm text-muted-foreground">
          {at.setup.cerradoDetalle}
        </p>
        <button
          onClick={() => router.push("/sign-in")}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {at.setup.cerradoCta}
        </button>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{at.setup.listoTitulo}</h1>
        <p className="text-sm text-muted-foreground">
          {at.setup.listoDetalle}
        </p>
        <button
          onClick={() => router.push("/sign-in")}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {at.setup.listoCta}
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold text-center">{at.setup.titulo}</h1>
      <p className="text-center text-sm text-muted-foreground">
        {at.setup.bajada}
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={at.comun.emailPlaceholder}
        required
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={at.setup.passwordPlaceholder}
        required
        minLength={8}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={at.setup.repetirPlaceholder}
        required
        minLength={8}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? at.setup.enviando : at.setup.cta}
      </button>
    </form>
  );
}