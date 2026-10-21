"use client";
import { useState } from "react";
import { at } from "@/lib/auth-textos";
import { createClient } from "@/lib/supabase/client";
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError(at.comun.noConfigurado);
      setLoading(false);
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      // Solo fallback: la plantilla de email del proyecto ya apunta a
      // /auth/confirm?token_hash=…&type=recovery, que verifica server-side y
      // NO usa PKCE (un link de email no puede: lo genera el servidor y el
      // browser que lo abre no tiene el code_verifier).
      { redirectTo: `${window.location.origin}/auth/confirm?type=recovery` },
    );
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }
  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{at.comun.revisaTuEmail}</h1>
        <p className="text-sm text-muted-foreground">
          {at.forgot.revisaTuEmailDetalle}
        </p>
        <a href="/sign-in" className="text-sm underline">
          {at.comun.volverAlLogin}
        </a>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold text-center">{at.forgot.titulo}</h1>
      <p className="text-center text-sm text-muted-foreground">
        {at.forgot.bajada}
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
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? at.forgot.enviando : at.forgot.cta}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        <a href="/sign-in" className="underline">
          {at.comun.volverAlLogin}
        </a>
      </p>
    </form>
  );
}