"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { at } from "@/lib/auth-textos";
import { createClient } from "@/lib/supabase/client";
import {
  mapSupabaseResetError,
  motivosDeContrasena,
  passwordCumple,
} from "@/lib/supabase/invite-errors";
/**
 * Se llega desde el link del email, ya con sesión activa: el aterrizaje
 * (/auth/confirm) la creó con verifyOtp. También es donde caen los flujos de
 * invitación, que activan la cuenta sin contraseña.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(at.reset.noCoinciden);
      return;
    }
    // Lo mismo que exige GoTrue, antes de llamarlo: si no, rechaza en inglés.
    if (!passwordCumple(password)) {
      setError(at.errores.passwordDebil);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError(at.comun.noConfigurado);
      setLoading(false);
      return;
    }
    // `activado_at` es EL hecho de "esta persona ya tiene una cuenta usable", y
    // se escribe acá porque esta pantalla es el único camino que puede elegir
    // una contraseña. No se infiere de `last_sign_in_at`: `verifyOtp` crea
    // sesión al ABRIR el link del mail, así que ese campo se prende aunque la
    // persona nunca haya llegado a este formulario.
    //
    // Va en la MISMA llamada que ya se hacía: un campo más, ningún request
    // extra. `data` se mergea sobre el `user_metadata` que ya tiene (el rol que
    // le puso el admin no se pisa).
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { activado_at: new Date().toISOString() },
    });
    if (updateError) {
      setError(
        mapSupabaseResetError(
          updateError.message,
          updateError.code,
          motivosDeContrasena(updateError),
        ),
      );
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }
  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold text-center">{at.reset.titulo}</h1>
      <p className="text-center text-sm text-muted-foreground">
        {at.reset.bajada}
      </p>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          {at.reset.label}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={at.reset.passwordPlaceholder}
          required
          minLength={8}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm" className="text-sm font-medium">
          {at.reset.labelConfirmar}
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={at.reset.confirmarPlaceholder}
          required
          minLength={8}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? at.reset.enviando : at.reset.cta}
      </button>
    </form>
  );
}
