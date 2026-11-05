"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { findProductByCode, type ScannedProduct } from "@/lib/actions/commerce";
import { createClient } from "@/lib/supabase/client";
import { createScannerUuid, parseScanEvent, type ScannerStatus } from "@/lib/scanner-protocol";

const STORAGE_KEY = "tdj.scanner.pc";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ScannerSession = { id: string; nonce: string; createdAt: number };
type ScanHandler = (product: ScannedProduct) => "ok" | "sin_stock" | Promise<"ok" | "sin_stock">;

function createSession(): ScannerSession {
  return {
    id: createScannerUuid(),
    nonce: createScannerUuid(),
    createdAt: Date.now(),
  };
}

function parseSession(value: unknown): ScannerSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Record<string, unknown>;
  if (
    typeof session.id !== "string" ||
    !UUID_PATTERN.test(session.id) ||
    typeof session.nonce !== "string" ||
    !UUID_PATTERN.test(session.nonce) ||
    typeof session.createdAt !== "number" ||
    !Number.isFinite(session.createdAt)
  ) {
    return null;
  }
  const age = Date.now() - session.createdAt;
  if (age < 0 || age >= SESSION_TTL_MS) return null;
  return { id: session.id, nonce: session.nonce, createdAt: session.createdAt };
}

export function useRemoteScannerPc(onFound: ScanHandler) {
  const [session, setSession] = useState<ScannerSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const onFoundRef = useRef(onFound);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    onFoundRef.current = onFound;
  }, [onFound]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      let nextSession: ScannerSession | null = null;
      if (saved) {
        try {
          nextSession = parseSession(JSON.parse(saved));
        } catch {
          nextSession = null;
        }
      }
      if (!nextSession) nextSession = createSession();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (error) {
      console.error("[remote-scanner] no se pudo guardar la sesión en este navegador.", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la sesión del escáner en este navegador.",
      );
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const supabase = createClient();
    if (!supabase) {
      toast.error("El escáner remoto requiere la configuración de Supabase.");
      return;
    }

    let active = true;
    let lastSeq = 0;
    const channel = supabase.channel(`scanner:${session.id}`, {
      config: {
        broadcast: { self: false },
        presence: { key: createScannerUuid() },
      },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        if (!active) return;
        const presence = channel.presenceState<{ role?: unknown; nonce?: unknown }>();
        setConnected(
          Object.values(presence)
            .flat()
            .some(
              (participant) => participant.role === "mobile" && participant.nonce === session.nonce,
            ),
        );
      })
      .on("broadcast", { event: "scan" }, (event) => {
        const scan = parseScanEvent(event.payload);
        if (!scan || scan.seq <= lastSeq) return;
        lastSeq = scan.seq;

        void (async () => {
          let status: ScannerStatus;
          let name: string | undefined;
          try {
            const lookup = await findProductByCode(scan.code);
            if (lookup.status !== "ok") {
              status = lookup.status;
              if (status === "not_found") toast.error(`Producto no registrado: ${scan.code}`);
            } else {
              name = lookup.product.name;
              status = await onFoundRef.current(lookup.product);
            }
          } catch (error) {
            console.error("[remote-scanner] no se pudo procesar el código escaneado.", error);
            status = "error";
          }

          if (!active) return;
          try {
            const response = await channel.send({
              type: "broadcast",
              event: "result",
              payload: { seq: scan.seq, status, ...(name ? { name } : {}) },
            });
            if (response !== "ok") {
              console.error("[remote-scanner] no se pudo enviar el resultado al celular.");
            }
          } catch (error) {
            console.error("[remote-scanner] falló el envío del resultado al celular.", error);
            toast.error("No se pudo enviar el resultado al celular.");
          }
        })();
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          void channel
            .track({ role: "pc", nonce: session.nonce })
            .then((response) => {
              if (response !== "ok") {
                console.error("[remote-scanner] no se pudo anunciar la PC en Presence.");
              }
            })
            .catch((error) => {
              console.error("[remote-scanner] falló el registro de Presence.", error);
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[remote-scanner] no se pudo conectar al canal (${status}).`);
          toast.error("No se pudo conectar con Supabase Realtime.");
        }
      });

    return () => {
      active = false;
      if (channelRef.current === channel) channelRef.current = null;
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [session, refreshVersion]);

  const unlink = useCallback(async () => {
    const channel = channelRef.current;
    if (channel) {
      try {
        const response = await channel.send({
          type: "broadcast",
          event: "unlink",
          payload: {},
        });
        if (response !== "ok") {
          toast.error("No se pudo avisar al celular que la sesión terminó.");
        }
      } catch (error) {
        console.error("[remote-scanner] falló el aviso de desvinculación.", error);
        toast.error("No se pudo avisar al celular que la sesión terminó.");
      }
      const supabase = createClient();
      if (supabase) {
        try {
          await supabase.removeChannel(channel);
        } catch (error) {
          console.error("[remote-scanner] no se pudo cerrar el canal de escaneo.", error);
        }
      }
      channelRef.current = null;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
      const nextSession = createSession();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (error) {
      console.error("[remote-scanner] no se pudo renovar la sesión del escáner.", error);
      toast.error("No se pudo renovar la sesión del escáner.");
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const expiresIn = Math.max(0, session.createdAt + SESSION_TTL_MS - Date.now());
    const timer = window.setTimeout(() => void unlink(), expiresIn);
    return () => window.clearTimeout(timer);
  }, [session, unlink]);

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);
  const sessionUrl =
    session && typeof window !== "undefined"
      ? `${window.location.origin}/escaner-movil?session=${encodeURIComponent(session.id)}&n=${encodeURIComponent(session.nonce)}`
      : null;

  return { sessionUrl, connected, unlink, refresh };
}
