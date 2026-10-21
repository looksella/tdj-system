import { at } from "@/lib/auth-textos";
import {
  esContrasenaFiltrada,
  motivosDeContrasena,
  passwordCumple,
  type CodigoBootstrap,
} from "@/lib/supabase/invite-errors";
import { timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Bootstrap del PRIMER admin. Sin esto el dueño queda afuera de su propia app:
 * no hay usuarios, el sign-up crea `customer` (o no existe), y la plataforma
 * NO siembra el admin.
 *
 * Dos capas independientes, ninguna reemplaza a la otra:
 *   1. La clave `ADMIN_SETUP_TOKEN` que viaja en el link que da TuSistema.
 *   2. Cero usuarios — quema el link después del primer uso.
 */
/** Cliente admin (service role). SOLO server-side: bypassa RLS. */
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
/**
 * Timing-safe y fail-closed: sin `ADMIN_SETUP_TOKEN` en el entorno, nadie crea
 * el admin. Nunca comparar con `===` (filtra el largo por timing) ni loggear ni
 * devolver el valor.
 */
function tokenValido(token: string): boolean {
  const esperado = process.env.ADMIN_SETUP_TOKEN ?? "";
  if (!esperado || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
/**
 * Toda respuesta de error del POST: `error` es SIEMPRE texto del pack (un
 * `/setup` viejo, que es pantalla y no se pisa, muestra `data.error` tal cual)
 * y `code` es lo que decide el `/setup` nuevo. El error de Supabase nunca va
 * crudo al cliente: el detalle queda en el log del server.
 */
function fallo(code: CodigoBootstrap, error: string, status: number) {
  return Response.json({ error, code }, { status });
}
/** Lo consume el sign-in para saber si hay que mandar a /setup. Nunca tira. */
export async function GET() {
  try {
    const { data, error } = await admin().auth.admin.listUsers();
    if (error) {
      console.error("[bootstrap] listUsers falló:", error);
      return Response.json({
        available: false,
        requires_token: true,
        code: "supabase",
      });
    }
    return Response.json({
      available: data.users.length === 0,
      requires_token: true,
    });
  } catch (e) {
    console.error("[bootstrap] GET falló:", e);
    return Response.json({
      available: false,
      requires_token: true,
      code: "supabase",
    });
  }
}
export async function POST(request: Request) {
  let email = "";
  let password = "";
  let token = "";
  try {
    const body = await request.json();
    email = String(body.email ?? "").trim();
    password = String(body.password ?? "");
    token = String(body.token ?? "");
  } catch {
    return fallo("datos_invalidos", at.api.datosInvalidos, 400);
  }
  // Capa 1 ANTES de cualquier otra validación: sin la clave, el endpoint no
  // revela nada (ni si el email existe, ni si ya se completó el setup).
  //
  // `token_invalid` es la única respuesta cuyo `error` es un código y no
  // texto: los `/setup` viejos lo comparan literal para mostrar `linkInvalido`.
  if (!tokenValido(token)) {
    return fallo("token_invalid", "token_invalid", 403);
  }
  if (!email || !password) {
    return fallo("faltan_datos", at.api.faltaEmailOPassword, 400);
  }
  if (!passwordCumple(password)) {
    return fallo("password_debil", at.errores.passwordDebil, 400);
  }
  try {
    const supabaseAdmin = admin();
    // Capa 2 — el guard que quema el link apenas exista un usuario.
    const { data: existing, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("[bootstrap] listUsers falló:", listError);
      return fallo("supabase", at.setup.errorGenerico, 500);
    }
    if (existing.users.length > 0) {
      return fallo("setup_completado", at.api.setupYaCompletado, 403);
    }
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      // El dueño entra directo: este flujo no manda mails, así que no lo pega
      // el límite de 2 emails/hora de Supabase.
      email_confirm: true,
      // `activado_at` porque ACÁ se elige una contraseña, igual que en
      // /reset-password. Es el otro camino que produce una cuenta usable, y sin
      // esta línea el dueño de cada sistema nuevo se veía a sí mismo en
      // /admin/usuarios como "Abrió el link, falta la contraseña", con un
      // botón de reenvío apuntándose a él, para siempre: la única forma de que
      // se le escribiera la marca era resetear la contraseña que acababa de
      // elegir. Cualquier camino nuevo que fije una contraseña escribe esto.
      //
      // `activado_at` se queda en `user_metadata` (es un hecho de la cuenta,
      // no un permiso); el rol NO. El rol va en `app_metadata`, que solo se
      // escribe con la service role key: `user_metadata` lo reescribe el
      // propio usuario desde el browser con la anon key, así que un rol ahí
      // no es un dato de confianza. `createUser` es el único camino que acepta
      // `app_metadata` en la misma llamada (las invitaciones necesitan un
      // segundo paso con `updateUserById`).
      app_metadata: { role: "admin" },
      user_metadata: { activado_at: new Date().toISOString() },
    });
    if (createError) {
      // `weak_password` es un código estable de GoTrue: la pantalla lo traduce.
      // Con `passwordCumple` ya chequeado, el motivo casi siempre es `pwned`
      // (HIBP, prendido en los proyectos nuevos), y repetirle la regla entera
      // al dueño no le dice qué cambiar.
      if (createError.code === "weak_password") {
        return esContrasenaFiltrada(motivosDeContrasena(createError))
          ? fallo("password_filtrada", at.errores.passwordFiltrada, 400)
          : fallo("password_debil", at.errores.passwordDebil, 400);
      }
      console.error("[bootstrap] createUser falló:", createError);
      return fallo("supabase", at.setup.errorGenerico, 500);
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[bootstrap] POST falló:", e);
    return fallo("supabase", at.setup.errorGenerico, 500);
  }
}
