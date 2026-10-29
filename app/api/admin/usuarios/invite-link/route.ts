import { at } from "@/lib/auth-textos";
import { isAllowed } from "@/lib/auth-helpers";
import { createClient } from "@supabase/supabase-js";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import { mapSupabaseInviteError } from "@/lib/supabase/invite-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Cliente admin (service role). SOLO server-side: bypassa RLS.
 *
 * Create the client per request so a missing environment variable does not
 * prevent Next.js from collecting route data during the build.
 */
function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
/**
 * Re-genera on-demand el link de acceso de alguien que todavía no eligió su
 * contraseña — haya abierto el link anterior o no.
 *
 * NO reutiliza el POST de alta: ese invita (crea el usuario) y acá la persona
 * ya existe, así que ese camino fallaría con "already registered".
 */
/** Return 503 when Supabase is not configured instead of creating an invalid client. */
function loginInactivo(): Response | null {
  if (LOGIN_ACTIVO) return null;
  return Response.json(
    { error: "login_inactivo" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const inactivo = loginInactivo();
  if (inactivo) return inactivo;
  const user = await getEffectiveUser();
  if (!user || !isAllowed(user.role, "users:manage")) {
    return new Response("Forbidden", { status: 403 });
  }
  const { email } = await request.json();
  const origin = new URL(request.url).origin;
  const { data: listData, error: listError } =
    await supabaseAdmin().auth.admin.listUsers();
  if (listError) {
    return Response.json({ error: listError.message }, { status: 500 });
  }
  const target = listData.users.find((u) => u.email === email);
  if (!target) {
    return Response.json(
      { error: at.api.personaNoEncontrada },
      { status: 400 },
    );
  }
  if (target.app_metadata?.role === "developer") {
    return Response.json(
      { error: "La cuenta de desarrolladora está protegida." },
      { status: 403 },
    );
  }
  // El gate mira el HECHO de haber elegido contraseña, no `last_sign_in_at`:
  // ese campo se prende al ABRIR el link (`verifyOtp` crea sesión), así que
  // rechazaba justo a quien más necesitaba el reenvío. Solo alguien que de
  // verdad activó su cuenta cae acá, y el copy lo manda a /forgot-password.
  if (target.user_metadata?.activado_at) {
    return Response.json(
      {
        error:
          at.api.personaYaActiva,
      },
      { status: 400 },
    );
  }
  // Qué link corresponde depende del estado, y es el punto de todo esto:
  //
  // - Nunca abrió el link → `invite`: su email todavía no está confirmado.
  // - Abrió y no eligió contraseña → `recovery`: el email YA está confirmado, y
  //   `invite` no es el primitivo correcto sobre un usuario confirmado.
  //   `recovery` existe para "esta persona necesita fijar una contraseña" y
  //   aterriza en el MISMO /reset-password vía /auth/confirm?type=recovery.
  //
  // Las dos llamadas se escriben aparte a propósito: los parámetros de
  // `generateLink` son una unión discriminada por `type`, así que pasar el
  // tipo en una variable no compila.
  //
  // Ninguna de las dos manda rol. El rol ya está fijado en `app_metadata`
  // desde el alta (lo escribió la service role key), y re-generar un link es
  // reenviar la invitación, no cambiar permisos. Tampoco va por
  // `options.data`: eso escribe `user_metadata`, que el propio invitado
  // reescribe con su sesión.
  const tipo = target.last_sign_in_at ? "recovery" : "invite";
  const redirectTo = `${origin}/auth/confirm?type=${tipo}`;
  const { data: linkData, error: linkError } =
    tipo === "recovery"
      ? await supabaseAdmin().auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        })
      : await supabaseAdmin().auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        });
  // Mismo criterio que el POST de alta: el link apunta a /auth/confirm con
  // token_hash, no al `action_link` default.
  const tokenHash = linkData?.properties?.hashed_token;
  if (!linkError && tokenHash) {
    const inviteLink = `${origin}/auth/confirm?token_hash=${tokenHash}&type=${tipo}`;
    return Response.json({ ok: true, inviteLink });
  }
  return Response.json(
    { error: mapSupabaseInviteError(linkError?.message ?? "") },
    { status: 400 },
  );
}