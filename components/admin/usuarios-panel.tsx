"use client";
import { useCallback, useEffect, useState } from "react";
import { at } from "@/lib/auth-textos";
/**
 * Los tres estados de una cuenta. El del medio —abrió el link del mail y nunca
 * eligió contraseña— existía desde siempre y el panel no lo sabía nombrar: lo
 * mostraba como activo, así que el admin no tenía nada para hacer con él.
 */
type Estado = "activo" | "abrio_sin_activar" | "pendiente";
type Usuario = {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
  estado: Estado;
  pending: boolean;
};
/** Con las palabras del dueño, no con vocabulario de auth. */
const ETIQUETA: Record<Estado, string> = {
  activo: at.usuarios.estadoActiva,
  abrio_sin_activar: at.usuarios.estadoAbrioSinActivar,
  pendiente: at.usuarios.estadoPendiente,
};
/**
 * Panel de gestión de usuarios: listado con el estado real de cada cuenta,
 * invitación (por email o por link), re-envío del link a quien todavía no
 * eligió contraseña, y baja.
 *
 * Sin dependencias de UI a propósito (ni toasts ni íconos): este archivo lo
 * escribe el pipeline sobre apps que no controlamos, así que solo usa HTML y
 * las clases de Tailwind que el scaffold garantiza. Los avisos van inline.
 */
export function UsuariosPanel({ roles }: { roles: string[] }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0] ?? "customer");
  // Arranca en "email" a propósito: es el camino robusto (sale por el servidor
  // de la plataforma, sin el tope de 2/hora del Supabase gratuito) y el link a
  // mano queda como la alternativa explícita.
  const [method, setMethod] = useState<"email" | "link">("email");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkNota, setLinkNota] = useState<string | null>(null);
  // La baja pide escribir el email: es la única acción del panel que no se
  // puede deshacer.
  const [quitando, setQuitando] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usuarios");
      const data = await res.json().catch(() => null);
      setUsuarios(Array.isArray(data) ? data : []);
    } catch {
      setUsuarios([]);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  function limpiarAvisos() {
    setError(null);
    setAviso(null);
    setInviteLink(null);
    setLinkNota(null);
  }
  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    limpiarAvisos();
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role, method }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || at.usuarios.errorInvitar);
        return;
      }
      if (data.delivery === "email") {
        setAviso(at.usuarios.invitacionEnviada);
      } else {
        setInviteLink(data.inviteLink);
        setLinkNota(
          method === "link"
            ? at.usuarios.linkNota24h
            : at.usuarios.rateLimitLink,
        );
      }
      setEmail("");
      void cargar();
    } catch {
      setError(at.usuarios.errorInvitar);
    } finally {
      setEnviando(false);
    }
  }
  async function copiarLinkDe(destinatario: string | null) {
    if (!destinatario) return;
    limpiarAvisos();
    try {
      const res = await fetch("/api/admin/usuarios/invite-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: destinatario }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || at.usuarios.errorLink);
        return;
      }
      await navigator.clipboard.writeText(data.inviteLink);
      setAviso(at.usuarios.linkCopiado);
    } catch {
      setError(at.usuarios.errorLink);
    }
  }
  function abrirBaja(u: Usuario) {
    limpiarAvisos();
    setQuitando(quitando === u.id ? null : u.id);
    setConfirmacion("");
  }
  /**
   * Las dos guardas de verdad (no borrarse a uno mismo, no borrar al último
   * admin) las resuelve el servidor sobre su propia lista. Lo de acá es que
   * nadie se lleve puesta una cuenta de un click.
   */
  async function quitar(u: Usuario) {
    limpiarAvisos();
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || at.usuarios.errorQuitar);
        return;
      }
      setQuitando(null);
      setConfirmacion("");
      setAviso(at.usuarios.quitado);
      void cargar();
    } catch {
      setError(at.usuarios.errorQuitar);
    }
  }
  return (
    <div className="space-y-8">
      <form onSubmit={invitar} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">{at.usuarios.invitarTitulo}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={at.usuarios.emailPlaceholder}
            required
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          />
          {roles.length > 1 && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              aria-label={at.usuarios.colRol}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as "email" | "link")}
            className="rounded-md border px-3 py-2 text-sm"
            aria-label={at.usuarios.metodo}
          >
            <option value="email">{at.usuarios.metodoEmail}</option>
            <option value="link">{at.usuarios.metodoLink}</option>
          </select>
          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {enviando ? at.usuarios.invitando : at.usuarios.invitar}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {at.usuarios.ayudaInvitar}
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {aviso && <p className="text-sm text-green-600">{aviso}</p>}
        {/* Se copió el link de alguien de la lista: no hay caja de link a la
            vista, así que el recordatorio de cómo mandarlo va acá. */}
        {!inviteLink && aviso === at.usuarios.linkCopiado && (
          <p className="text-xs text-muted-foreground">
            {at.usuarios.avisoCompartirLink}
          </p>
        )}
        {inviteLink && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteLink}
                className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteLink);
                  setAviso(at.usuarios.linkCopiado);
                }}
                className="rounded-md border px-3 py-2 text-sm font-medium"
              >
                {at.usuarios.copiar}
              </button>
            </div>
            {linkNota && (
              <p className="text-xs text-muted-foreground">{linkNota}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {at.usuarios.avisoCompartirLink}
            </p>
          </div>
        )}
      </form>
      <div className="space-y-3">
        <h2 className="text-sm font-medium">{at.usuarios.listaTitulo}</h2>
        {cargando ? (
          <p className="text-sm text-muted-foreground">{at.comun.cargando}</p>
        ) : usuarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {at.usuarios.sinUsuarios}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">{at.usuarios.colEmail}</th>
                  <th className="px-3 py-2 font-medium">{at.usuarios.colRol}</th>
                  <th className="px-3 py-2 font-medium">{at.usuarios.colEstado}</th>
                  <th className="px-3 py-2 font-medium">{at.usuarios.colAlta}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-t align-top">
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{u.role}</td>
                    <td className="px-3 py-2">{ETIQUETA[u.estado]}</td>
                    <td className="px-3 py-2">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {u.estado !== "activo" && (
                          <button
                            type="button"
                            onClick={() => void copiarLinkDe(u.email)}
                            className="rounded-md border px-2 py-1 text-xs font-medium"
                          >
                            {u.estado === "pendiente"
                              ? at.usuarios.copiarLink
                              : at.usuarios.reenviarLink}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => abrirBaja(u)}
                          className="rounded-md border px-2 py-1 text-xs font-medium"
                        >
                          {at.usuarios.quitar}
                        </button>
                      </div>
                      {quitando === u.id && (
                        <div className="mt-2 space-y-2 text-left">
                          <p className="text-xs text-muted-foreground">
                            {at.usuarios.quitarConfirma}
                          </p>
                          <div className="flex flex-wrap justify-end gap-2">
                            <input
                              value={confirmacion}
                              onChange={(e) => setConfirmacion(e.target.value)}
                              placeholder={at.usuarios.emailPlaceholder}
                              className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
                              aria-label={at.usuarios.quitarConfirma}
                            />
                            <button
                              type="button"
                              disabled={
                                !u.email || confirmacion.trim() !== u.email
                              }
                              onClick={() => void quitar(u)}
                              className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                            >
                              {at.usuarios.quitarCta}
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuitando(null)}
                              className="rounded-md border px-2 py-1 text-xs font-medium"
                            >
                              {at.usuarios.cancelar}
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
