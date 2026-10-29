import { createClient, type User } from "@supabase/supabase-js";
import { INVITABLE_ROLES, isAllowed } from "@/lib/auth-helpers";
import { at } from "@/lib/auth-textos";
import { LOGIN_ACTIVO } from "@/lib/supabase/estado";
import { getEffectiveUser } from "@/lib/supabase/helpers";
import {
  isSupabaseRateLimit,
  mapSupabaseInviteError,
} from "@/lib/supabase/invite-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Cliente admin (service role). SOLO server-side: bypassa RLS.
 *
 * Perezoso a propósito: `createClient` lanza si la URL es `undefined`, y Next
 * evalúa este módulo durante el build. Acá se crea por request.
 */
function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
/**
 * El control de acceso real de la gestión de usuarios. Ocultar el link en el
 * sidebar, o el guard de la page, son cosmética: este chequeo es el que cuenta.
 */
function loginInactivo(): Response | null {
  if (LOGIN_ACTIVO) return null;
  return Response.json(
    { error: "login_inactivo" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
async function requireUserManager(): Promise<Response | null> {
  const inactivo = loginInactivo();
  if (inactivo) return inactivo;
  const user = await getEffectiveUser();
  if (!user || !isAllowed(user.role, "users:manage")) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
/**
 * Los TRES estados de una cuenta, que son tres y no dos.
 *
 * `last_sign_in_at` NO significa "activó su cuenta": `verifyOtp` crea sesión al
 * ABRIR el link del mail, así que se prende aunque la persona nunca haya
 * elegido contraseña. Quien queda ahí no puede entrar (no tiene contraseña) y
 * el panel lo listaba como activo, así que el admin no tenía forma de ayudarlo.
 *
 * El hecho real lo escribe `/reset-password` en `user_metadata.activado_at`,
 * que es el único camino que puede elegir una contraseña.
 *
 * Las cuentas activadas ANTES de que existiera esa marca caen en
 * `abrio_sin_activar`, y es a propósito: el peor efecto es ofrecer un reenvío
 * de más, y la alternativa (inferir "activo" de `last_sign_in_at`) reproduce el
 * bug. El primer `updateUser` de cada una las normaliza.
 */
function estadoDe(u: User): "activo" | "abrio_sin_activar" | "pendiente" {
  if (u.user_metadata?.activado_at) return "activo";
  if (u.last_sign_in_at) return "abrio_sin_activar";
  return "pendiente";
}
/** Listado. `pending` queda como derivado de `estado`, para no romper nada. */
export async function GET() {
  const forbidden = await requireUserManager();
  if (forbidden) return forbidden;
  const { data, error } = await supabaseAdmin().auth.admin.listUsers();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(
    data.users.map((u) => {
      const estado = estadoDe(u);
      return {
        id: u.id,
        email: u.email,
        // El rol de confianza vive en `app_metadata` (solo lo escribe la
        // service role key). `user_metadata` lo reescribe el propio usuario:
        // leer de ahí era mostrar lo que el invitado dijo de sí mismo.
        role: u.app_metadata?.role ?? "customer",
        created_at: u.created_at,
        estado,
        pending: estado !== "activo",
      };
    }),
  );
}
/**
 * Paso 2 de toda invitación: fijar el rol en `app_metadata`.
 *
 * Ni `inviteUserByEmail` ni `generateLink` aceptan `app_metadata` — su opción
 * `data` escribe `user_metadata`, que el propio invitado puede reescribir
 * después con su sesión. Por eso el rol se fija en un segundo request con la
 * service role key, y de paso se limpia cualquier `role` que haya quedado en
 * `user_metadata` para que no exista una segunda versión del dato.
 *
 * Falla RUIDOSO: si este paso no pasa, se borra el usuario recién invitado y
 * se devuelve error. Dejarlo a medio crear (sin rol, o con el rol solo en
 * `user_metadata`) es peor que no haberlo invitado: el admin ve un "listo" y
 * la persona entra sin permisos, o con un rol que ella misma controla.
 *
 * Borrar es SOLO para el que nació en esta invitación (`revertir`): Supabase
 * no falla al invitar un email que ya existe sin confirmar, reenvía sobre ese
 * usuario, y borrarlo sería borrar a alguien que ya estaba.
 *
 * Devuelve la `Response` de error, o `null` si salió todo bien.
 */
async function elevarRol(
  userId: string | undefined,
  role: string,
  email: string,
  revertir: boolean,
): Promise<Response | null> {
  const admin = supabaseAdmin();
  if (!userId) {
    // Sin id no hay forma de fijar el rol. No se puede "seguir igual".
    console.error("[usuarios] invitación sin id de usuario", email);
    return Response.json({ error: at.api.rolNoAplicado }, { status: 500 });
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
    user_metadata: { role: null },
  });
  if (!error) return null;
  console.error("[usuarios] no se pudo fijar el rol", email, error.message);
  if (!revertir) {
    return Response.json({ error: at.api.rolNoAplicado }, { status: 500 });
  }
  // Revertir: sin rol confiable, el usuario no debe quedar existiendo.
  try {
    const { error: borrar } = await admin.auth.admin.deleteUser(userId);
    if (borrar) {
      // No se pudo revertir: queda un usuario sin rol. Lo grita el log, la
      // respuesta ya es error y el admin lo ve en el listado como `customer`.
      console.error("[usuarios] revert fallido", userId, borrar.message);
    }
  } catch (e) {
    console.error("[usuarios] revert fallido", userId, String(e).slice(0, 200));
  }
  return Response.json({ error: at.api.rolNoAplicado }, { status: 500 });
}
/**
 * Developer accounts are intentionally excluded; they can only be provisioned
 * through the local developer bootstrap command.
 */
function rolAsignable(role: string): boolean {
  return INVITABLE_ROLES.some((candidate) => candidate === role);
}
/**
 * Alta de un invitado, por email o por link. UN método por invitado, nunca los
 * dos: el segundo falla con "already registered".
 *
 * `inviteUserByEmail` crea el usuario Y manda el mail en una sola llamada.
 * NUNCA `createUser` para invitar: marca el email como confirmado, no envía
 * nada, y deja al invitado sin mail y sin contraseña mientras el admin ve un
 * "éxito" que no ocurrió.
 *
 * Si el mail rebota contra el límite de 2/hora, CAE al camino link en vez de
 * fallar: `generateLink` no manda email ni consume ese límite.
 */
export async function POST(request: Request) {
  const forbidden = await requireUserManager();
  if (forbidden) return forbidden;
  const { email, role, method } = await request.json();
  const origin = new URL(request.url).origin;
  const redirectTo = `${origin}/auth/confirm?type=invite`;
  // El rol es dato de CONFIANZA (lo escribe la service role key y lo lee
  // `isAllowed`), así que no puede entrar crudo desde el body: se valida
  // contra los roles que este sistema declara. Fail closed: un rol
  // desconocido es 400, nunca un usuario con un rol inventado en la base.
  const rolPedido =
    typeof role === "string" && role.trim() ? role.trim() : "customer";
  if (!rolAsignable(rolPedido)) {
    return Response.json({ error: at.api.rolInvalido }, { status: 400 });
  }
  // ¿El email ya existía? Si la elevación falla, se borra solo a quien nació
  // en esta invitación. Sin la lista completa no se sabe: no se borra.
  const previos = await listarTodosLosUsuarios();
  const emailPedido = String(email ?? "").toLowerCase();
  const yaExistia =
    previos.error !== null ||
    !previos.completa ||
    previos.users.some((u) => (u.email ?? "").toLowerCase() === emailPedido);
  let errorBase: string | null = null;
  // Las dos invitaciones van SIN `data`: ese campo escribe `user_metadata`.
  // El rol se fija después, con `elevarRol`.
  if (method !== "link") {
    const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(
      email,
      { redirectTo },
    );
    if (!error) {
      const elevado = await elevarRol(data.user?.id, rolPedido, email, !yaExistia);
      if (elevado) return elevado;
      return Response.json({ ok: true, delivery: "email", id: data.user?.id });
    }
    if (!isSupabaseRateLimit(error.message)) {
      return Response.json(
        { error: mapSupabaseInviteError(error.message) },
        { status: 400 },
      );
    }
    errorBase = error.message;
  }
  const { data: linkData, error: linkError } =
    await supabaseAdmin().auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
  // El link copiable apunta a /auth/confirm (verifyOtp con token_hash), NO al
  // `action_link` default (/auth/v1/verify → code exchange PKCE): el browser
  // que abre un link de email no tiene el code_verifier y ese camino rompe.
  const tokenHash = linkData?.properties?.hashed_token;
  if (!linkError && tokenHash) {
    const elevado = await elevarRol(linkData?.user?.id, rolPedido, email, !yaExistia);
    if (elevado) return elevado;
    const inviteLink = `${origin}/auth/confirm?token_hash=${tokenHash}&type=invite`;
    return Response.json({ ok: true, delivery: "link", inviteLink });
  }
  return Response.json(
    { error: mapSupabaseInviteError(errorBase ?? linkError?.message ?? "") },
    { status: 400 },
  );
}
/**
 * Toda la lista de usuarios, paginada hasta el final.
 *
 * `listUsers()` devuelve UNA página. Para las guardas del borrado eso no es un
 * detalle de performance, y la dirección del error se invierte según la guarda:
 * para "último admin", leer de menos empuja a RECHAZAR, que es el lado seguro;
 * para "no borres al fundador", leer de menos hace que el `created_at` mínimo
 * sea otra persona, así que la guarda protegería a quien no es y dejaría borrar
 * al dueño. O sea: una guarda que aparenta proteger y no protege.
 *
 * Se corta cuando una página vuelve VACÍA, no cuando vuelve más corta que
 * `perPage`: el servidor puede recortar el tamaño de página que se le pide, y
 * ahí "más corta" se leería como "última" antes de tiempo — el error caro de
 * nuevo. Cuesta un request extra en una acción que se usa muy de vez en cuando.
 *
 * `completa: false` (se agotó el tope, o el upstream falló) es fail-closed: el
 * caller no borra.
 */
const MAX_PAGINAS = 100;
async function listarTodosLosUsuarios(): Promise<{
  users: User[];
  completa: boolean;
  error: string | null;
}> {
  const todos: User[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) return { users: todos, completa: false, error: error.message };
    if (data.users.length === 0) {
      return { users: todos, completa: true, error: null };
    }
    todos.push(...data.users);
  }
  return { users: todos, completa: false, error: null };
}
/**
 * Quitar a alguien del sistema.
 *
 * Es la salida de emergencia del admin: sin esto, un invitado que quedó en el
 * limbo (abrió el link y no eligió contraseña) no se podía ni borrar ni
 * arreglar, y la única herramienta del dueño era escribirnos.
 *
 * TRES negativas FAIL-CLOSED, las tres resueltas en el servidor sobre la lista
 * COMPLETA del MISMO request (la confirmación del panel es cortesía, no
 * control: un curl la saltea):
 *
 *   1. Nadie se borra a sí mismo.
 *   2. No se borra al primer administrador (el `created_at` más viejo).
 *   3. No se borra al último admin — el sistema quedaría sin nadie que pueda
 *      administrar usuarios, y de ahí no se vuelve.
 *
 * La 2 no es redundante con la 3. Nació cuando el rol vivía en
 * `user_metadata`, que el propio usuario reescribe desde el browser: contra
 * alguien que se auto-promovía, la guarda del último admin no servía (lo
 * contaba a él como segundo admin) y la de auto-borrado tampoco (borraba a
 * otro). Desde el molde 1.7.0 el rol vive en `app_metadata` y ese camino está
 * cerrado, pero la guarda se queda: un admin legítimo invitado por el dueño
 * tampoco debería poder dejarlo afuera, y `created_at` lo escribe Supabase y
 * el usuario no lo puede tocar.
 */
export async function DELETE(request: Request) {
  const forbidden = await requireUserManager();
  if (forbidden) return forbidden;
  // El body se parsea adentro del try: sin él, un request vacío o con algo que
  // no es JSON tira, y Next lo sirve como un 500 con stack adentro del sistema
  // del dueño en vez del 400 que está tres líneas más abajo.
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) {
    return Response.json({ error: at.api.datosInvalidos }, { status: 400 });
  }
  const actor = await getEffectiveUser();
  if (actor && actor.id === id) {
    return Response.json({ error: at.api.noTePodesQuitar }, { status: 400 });
  }
  const { users, completa, error } = await listarTodosLosUsuarios();
  if (error) {
    return Response.json({ error }, { status: 500 });
  }
  if (!completa) {
    // Fail-closed: sin la lista entera no se sabe quién creó el sistema, y
    // equivocarse acá es justamente dejar borrar al dueño.
    return Response.json(
      { error: at.api.demasiadosUsuarios },
      { status: 409 },
    );
  }
  const target = users.find((u) => u.id === id);
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
  // Guarda 2: el fundador es el `created_at` mínimo de la lista COMPLETA.
  const fundador = users.reduce((viejo, u) =>
    new Date(u.created_at) < new Date(viejo.created_at) ? u : viejo,
  );
  if (fundador.id === id) {
    return Response.json({ error: at.api.fundadorNoSeQuita }, { status: 400 });
  }
  // Guarda 3: el último admin. Lee `app_metadata`, el MISMO campo que
  // `getEffectiveUser()`: contar admins en otro campo es contar a quien se
  // escribió el rol a sí mismo.
  const admins = users.filter((u) => u.app_metadata?.role === "admin");
  if (target.app_metadata?.role === "admin" && admins.length <= 1) {
    return Response.json({ error: at.api.ultimoAdmin }, { status: 400 });
  }
  const { error: deleteError } =
    await supabaseAdmin().auth.admin.deleteUser(id);
  if (deleteError) {
    return Response.json({ error: at.api.noSePudoQuitar }, { status: 400 });
  }
  return Response.json({ ok: true });
}
