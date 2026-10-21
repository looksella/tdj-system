import { at } from "@/lib/auth-textos";
import { createClient } from "@supabase/supabase-js";
import { rechazoPorCupo } from "@/lib/supabase/cupo";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import { mapSupabaseInviteError } from "@/lib/supabase/invite-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Cliente admin (service role). SOLO server-side: bypassa RLS.
 *
 * Perezoso a propósito: `createClient` lanza si la URL es `undefined`, y Next
 * evalúa este módulo en "Collecting page data" durante `next build`. Con el
 * cliente a nivel de módulo, un deploy al que todavía no llegaron las env vars
 * de Supabase (auth horneada por la plataforma, primer publish antes del
 * provisioning) rompía el build entero. Acá se crea por request.
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
/**
 * El login de este sistema todavía no está activo: la plataforma inyecta las
 * variables de Supabase recién al activarlo (hace falta un plan).
 *
 * Un 503 explícito y no una excepción: sin esto, `getEffectiveUser()` y
 * `supabaseAdmin()` construyen el cliente con
 * `process.env.NEXT_PUBLIC_SUPABASE_URL!` y tiran, o sea que la ruta devolvía
 * un 500 con un stack de Next adentro del sistema del dueño. El código
 * `login_inactivo` es para que quien consuma esta ruta pueda distinguir "no
 * está activo" de "se rompió".
 */
function loginInactivo(): Response | null {
  // `AUTH_ABIERTO` (el plan del dueño terminó, ver `lib/supabase/helpers.ts`)
  // cierra esta ruta por el MISMO 503: con el sistema abierto todo visitante
  // es admin, así que sin esto cualquiera podría listar —o crear— los usuarios
  // del sistema. Las cuentas no se tocan; vuelven a administrarse con el plan.
  if (LOGIN_ACTIVO && process.env.BEON_AUTH_MODE !== "open") return null;
  return Response.json(
    { error: "login_inactivo" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const inactivo = loginInactivo();
  if (inactivo) return inactivo;
  const user = await getEffectiveUser();
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  // El mismo tope que el alta: sin plan entra solo el dueño, y un link nuevo
  // es una puerta más. Sin respuesta de la plataforma no se genera.
  const sinCupo = await rechazoPorCupo();
  if (sinCupo) return sinCupo;
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