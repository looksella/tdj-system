// Optional server-side synchronization with the configured calendar service.
const HELPER = "beon-calendario/1.0.1";
export type EstadoCalendario = {
  /** `solo_publicado`: Ya no se devuelve (2026-10-02). Queda en el tipo para que compilen las apps que lo comparan. */
  status: "connected" | "disconnected" | "disabled" | "solo_publicado";
  /** La cuenta de Google conectada (solo con `connected`). */
  account?: string;
  /** Dónde conecta el dueño su Google Calendar (solo con `disconnected`). */
  connectUrl?: string;
};
export type TurnoParaCalendario = {
  /** El id del turno en ESTE sistema: el mismo turno nunca crea dos eventos. */
  externalId: string;
  titulo: string;
  inicio: Date | string;
  fin: Date | string;
  /** Zona horaria IANA del negocio (la de su país), la misma con la que la app muestra las horas. */
  zonaHoraria: string;
  descripcion?: string;
  /** Emails que reciben la invitación de Google (máximo 20). */
  invitados?: string[];
  /** El evento que ya tiene este turno, si se está reprogramando. */
  googleEventId?: string | null;
};
export type ResultadoSincronizacion =
  | { synced: true; googleEventId: string; htmlLink?: string; meetLink?: string }
  | {
      synced: false;
      /** `solo_publicado`: Ya no se devuelve (2026-10-02). Queda en el tipo para que compilen las apps que lo comparan. */
      reason: "not_connected" | "disabled" | "error" | "solo_publicado";
      message?: string;
      connectUrl?: string;
    };
type DetalleDeError = { error?: string; message?: string; connect_url?: string };
function configuracion(): { url: string; key: string } {
  // Env vars leídas al llamar, no al cargar el módulo (App Router las resuelve
  // por request; a nivel módulo pueden ser undefined).
  const url = process.env.BEON_TOOLS_URL;
  const key = process.env.BEON_TOOLS_API_KEY;
  if (!url || !key) throw new Error("Beon Tools no configurado para este proyecto.");
  return { url, key };
}
async function llamar(operacion: string, body: Record<string, unknown>): Promise<Response> {
  const { url, key } = configuracion();
  return fetch(`${url}/v1/calendar/${operacion}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Beon-Helper": HELPER,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}
async function detalle(res: Response): Promise<DetalleDeError> {
  try {
    const body = (await res.json()) as { detail?: DetalleDeError };
    return body?.detail ?? {};
  } catch {
    return {};
  }
}
function aFecha(valor: Date | string): string {
  // Un string sin zona ("2026-10-02T10:00") viaja tal cual: Google lo lee en
  // la `zonaHoraria` del turno, que es la hora que ve el dueño en su agenda.
  return valor instanceof Date ? valor.toISOString() : valor;
}
async function sinSincronizar(res: Response): Promise<ResultadoSincronizacion> {
  const d = await detalle(res);
  if (res.status === 409) {
    return { synced: false, reason: "not_connected", message: d.message, connectUrl: d.connect_url };
  }
  if (res.status === 503) return { synced: false, reason: "disabled", message: d.message };
  return { synced: false, reason: "error", message: d.message || `Google Calendar ${res.status}` };
}
/** En qué está la conexión del Google Calendar del dueño. No lanza: ante
 *  cualquier falla del proxy devuelve `disabled` (la app no muestra el botón). */
export async function estadoCalendario(): Promise<EstadoCalendario> {
  let res: Response;
  try {
    res = await llamar("status", {});
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Beon Tools no configurado")) throw error;
    return { status: "disabled" };
  }
  if (!res.ok) return { status: "disabled" };
  const body = (await res.json()) as { status?: string; account?: string | null; connect_url?: string | null };
  if (body.status === "connected") return { status: "connected", account: body.account ?? undefined };
  if (body.status === "disconnected") return { status: "disconnected", connectUrl: body.connect_url ?? undefined };
  return { status: "disabled" };
}
/** Crea o mueve el evento del turno en el Google Calendar del dueño. Guardá
 *  `googleEventId` en el turno para poder reprogramarlo o cancelarlo. */
export async function sincronizarTurno(turno: TurnoParaCalendario): Promise<ResultadoSincronizacion> {
  let res: Response;
  try {
    res = await llamar("upsert", {
      external_id: turno.externalId,
      titulo: turno.titulo,
      inicio: aFecha(turno.inicio),
      fin: aFecha(turno.fin),
      zona_horaria: turno.zonaHoraria,
      ...(turno.descripcion ? { descripcion: turno.descripcion } : {}),
      ...(turno.invitados?.length ? { invitados: turno.invitados } : {}),
      ...(turno.googleEventId ? { google_event_id: turno.googleEventId } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Beon Tools no configurado")) throw error;
    return { synced: false, reason: "error", message: "No se pudo contactar al servicio de calendario." };
  }
  if (!res.ok) return sinSincronizar(res);
  const body = (await res.json()) as { google_event_id: string; html_link?: string | null; meet_link?: string | null };
  return {
    synced: true,
    googleEventId: body.google_event_id,
    htmlLink: body.html_link ?? undefined,
    meetLink: body.meet_link ?? undefined,
  };
}
/** Borra el evento del turno (avisa a los invitados). Un evento que ya no
 *  existe en Google cuenta como borrado. */
export async function cancelarTurno(googleEventId: string): Promise<{ synced: boolean; reason?: string }> {
  let res: Response;
  try {
    res = await llamar("cancel", { google_event_id: googleEventId });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Beon Tools no configurado")) throw error;
    return { synced: false, reason: "error" };
  }
  if (!res.ok) {
    const r = await sinSincronizar(res);
    return { synced: false, reason: r.synced ? undefined : r.reason };
  }
  return { synced: true };
}
