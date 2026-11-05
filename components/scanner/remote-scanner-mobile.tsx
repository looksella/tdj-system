"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Camera, CameraOff, Flashlight, FlashlightOff } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  createScannerUuid,
  isScannerStatus,
  type ScannerResult,
  type ScannerStatus,
} from "@/lib/scanner-protocol";

const STORAGE_KEY = "tdj.scanner.mobile";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

type MobileSession = {
  id: string;
  nonce: string;
  createdAt: number;
  seq: number;
};
type NativeBarcode = { rawValue: string };
type NativeDetector = {
  detect(source: HTMLVideoElement): Promise<NativeBarcode[]>;
};
type NativeDetectorConstructor = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};
type WakeLock = { release(): Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLock> };
};
type TrackCapabilitiesWithTorch = MediaTrackCapabilities & { torch?: boolean };
type TrackConstraintsWithTorch = MediaTrackConstraints & {
  advanced?: Array<MediaTrackConstraintSet & { torch?: boolean }>;
};

function parseMobileSession(value: unknown): MobileSession | null {
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
  return {
    id: session.id,
    nonce: session.nonce,
    createdAt: session.createdAt,
    seq: Number.isSafeInteger(session.seq) && Number(session.seq) >= 0 ? Number(session.seq) : 0,
  };
}

export function RemoteScannerMobile() {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "connected" | "offline">(() =>
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? "connecting"
      : "offline",
  );
  const [feedback, setFeedback] = useState<{ status: ScannerStatus; name?: string } | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<{ stop(): void } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const sequenceRef = useRef(0);
  const pendingSequencesRef = useRef(new Set<number>());
  const codeTimesRef = useRef(new Map<string, number>());
  const wakeLockRef = useRef<WakeLock | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const querySession = params.get("session");
      const queryNonce = params.get("n");
      let next: MobileSession | null = null;
      if (params.has("session") || params.has("n")) {
        window.history.replaceState(window.history.state, "", window.location.pathname);
        next = parseMobileSession({
          id: querySession ?? "",
          nonce: queryNonce ?? "",
          createdAt: Date.now(),
          seq: 0,
        });
        if (next) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          setSessionEnded(false);
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setSessionEnded(true);
          setCameraError("El vínculo del escáner no es válido. Vuelve a escanear el QR.");
        }
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            next = parseMobileSession(JSON.parse(saved));
          } catch {
            next = null;
          }
        }
        if (!next) {
          localStorage.removeItem(STORAGE_KEY);
          setSessionEnded(Boolean(saved));
        }
      }
      if (next) {
        sequenceRef.current = next.seq;
        pendingSequencesRef.current.clear();
        setSession(next);
      }
    } catch (error) {
      console.error("[remote-scanner-mobile] no se pudo recuperar la sesión del celular.", error);
      setCameraError("No se pudo guardar la sesión en este navegador.");
    } finally {
      setSessionReady(true);
    }
  }, []);

  const showFeedback = useCallback((status: ScannerStatus, name?: string) => {
    setFeedback({ status, name });
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedback(null), 2800);

    if (status === "ok") {
      if (navigator.vibrate) navigator.vibrate(100);
      const context = audioContextRef.current;
      if (context) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 1320;
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.12);
      }
    } else if (status === "not_found" || status === "retirado" || status === "error") {
      if (navigator.vibrate) navigator.vibrate([100, 100, 100]);
      const context = audioContextRef.current;
      if (context) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 620;
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
      }
    }
  }, []);

  const stopCamera = useCallback((updateState = true) => {
    activeRef.current = false;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (wakeLock) {
      void wakeLock.release().catch((error) => {
        console.error("[remote-scanner-mobile] no se pudo liberar Wake Lock.", error);
      });
    }
    if (updateState) {
      setCameraOn(false);
      setTorchAvailable(false);
      setTorchOn(false);
    }
  }, []);

  const sessionId = session?.id;
  const sessionNonce = session?.nonce;
  useEffect(() => {
    if (!sessionId || !sessionNonce) return;
    const supabase = createClient();
    if (!supabase) {
      return;
    }

    let active = true;
    const channel = supabase.channel(`scanner:${sessionId}`, {
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
        const pcPresent = Object.values(presence)
          .flat()
          .some((participant) => participant.role === "pc" && participant.nonce === sessionNonce);
        setConnection(pcPresent ? "connected" : "connecting");
      })
      .on("broadcast", { event: "result" }, (event) => {
        const payload = event.payload as Partial<ScannerResult> | null;
        if (
          !active ||
          !payload ||
          typeof payload.seq !== "number" ||
          !Number.isSafeInteger(payload.seq) ||
          !isScannerStatus(payload.status) ||
          !pendingSequencesRef.current.has(payload.seq)
        ) {
          return;
        }
        pendingSequencesRef.current.delete(payload.seq);
        showFeedback(payload.status, typeof payload.name === "string" ? payload.name : undefined);
      })
      .on("broadcast", { event: "unlink" }, () => {
        active = false;
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
          console.error("[remote-scanner-mobile] no se pudo borrar la sesión finalizada.", error);
        }
        setSession(null);
        setSessionEnded(true);
        setConnection("offline");
        stopCamera();
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          void channel
            .track({ role: "mobile", nonce: sessionNonce })
            .then((response) => {
              if (response !== "ok") {
                console.error(
                  "[remote-scanner-mobile] no se pudo anunciar el celular en Presence.",
                );
              }
            })
            .catch((error) => {
              console.error("[remote-scanner-mobile] falló el registro de Presence.", error);
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("offline");
          console.error(`[remote-scanner-mobile] no se pudo conectar al canal (${status}).`);
        }
      });

    return () => {
      active = false;
      if (channelRef.current === channel) channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId, sessionNonce, showFeedback, stopCamera]);

  const publishScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      const now = Date.now();
      const lastSentAt = codeTimesRef.current.get(code);
      if (lastSentAt !== undefined && now - lastSentAt < 1500) return;
      codeTimesRef.current.set(code, now);
      for (const [previousCode, sentAt] of codeTimesRef.current) {
        if (now - sentAt >= 1500) codeTimesRef.current.delete(previousCode);
      }

      const channel = channelRef.current;
      const nextSeq = sequenceRef.current + 1;
      sequenceRef.current = nextSeq;
      pendingSequencesRef.current.add(nextSeq);
      if (session) {
        const updatedSession = { ...session, seq: nextSeq };
        setSession(updatedSession);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
        } catch (error) {
          console.error(
            "[remote-scanner-mobile] no se pudo guardar la secuencia del escáner.",
            error,
          );
        }
      }

      if (!channel) {
        pendingSequencesRef.current.delete(nextSeq);
        showFeedback("error");
        return;
      }
      try {
        const response = await channel.send({
          type: "broadcast",
          event: "scan",
          payload: { code, seq: nextSeq, ts: now },
        });
        if (response !== "ok") {
          pendingSequencesRef.current.delete(nextSeq);
          showFeedback("error");
        }
      } catch (error) {
        pendingSequencesRef.current.delete(nextSeq);
        console.error("[remote-scanner-mobile] no se pudo enviar el código escaneado.", error);
        showFeedback("error");
      }
    },
    [session, showFeedback],
  );

  const requestWakeLock = useCallback(async () => {
    const wakeLockApi = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLockApi) return;
    try {
      wakeLockRef.current = await wakeLockApi.request("screen");
    } catch (error) {
      console.error("[remote-scanner-mobile] no se pudo activar Wake Lock.", error);
    }
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      stopCamera();
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();

        const availableDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = availableDevices.filter((device) => device.kind === "videoinput");
        setDevices(cameras);
        const track = stream.getVideoTracks()[0];
        const activeDevice = track?.getSettings().deviceId;
        setSelectedDevice(deviceId ?? activeDevice ?? cameras[0]?.deviceId ?? "");
        const capabilities = track?.getCapabilities?.() as TrackCapabilitiesWithTorch | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));
        setCameraOn(true);
        activeRef.current = true;
        await requestWakeLock();

        const detectorConstructor = (
          window as Window & { BarcodeDetector?: NativeDetectorConstructor }
        ).BarcodeDetector;
        let supportedFormats: string[] = [];
        if (detectorConstructor?.getSupportedFormats) {
          try {
            supportedFormats = await detectorConstructor.getSupportedFormats();
          } catch (error) {
            console.error(
              "[remote-scanner-mobile] no se pudo consultar BarcodeDetector; se usará ZXing.",
              error,
            );
          }
        }
        const nativeFormats = BARCODE_FORMATS.filter((format) => supportedFormats.includes(format));

        if (detectorConstructor && nativeFormats.length) {
          const detector = new detectorConstructor({ formats: nativeFormats });
          let detecting = false;
          const detectFrame = async () => {
            if (!activeRef.current) return;
            if (!detecting && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              detecting = true;
              try {
                const results = await detector.detect(video);
                const value = results[0]?.rawValue;
                if (value) void publishScan(value);
              } catch (error) {
                console.error("[remote-scanner-mobile] falló la detección nativa.", error);
                setCameraError("No se pudo leer el código. Intenta ajustar la cámara.");
                stopCamera();
                return;
              } finally {
                detecting = false;
              }
            }
            if (activeRef.current) animationFrameRef.current = requestAnimationFrame(detectFrame);
          };
          animationFrameRef.current = requestAnimationFrame(detectFrame);
        } else {
          const hints = new Map<DecodeHintType, unknown>([
            [
              DecodeHintType.POSSIBLE_FORMATS,
              [
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.QR_CODE,
              ],
            ],
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          const controls = await reader.decodeFromVideoElement(video, (result) => {
            const value = result?.getText();
            if (value) void publishScan(value);
          });
          if (activeRef.current) scannerControlsRef.current = controls;
          else controls.stop();
        }
      } catch (error) {
        console.error("[remote-scanner-mobile] no se pudo iniciar la cámara.", error);
        stopCamera();
        setCameraError(
          "No se pudo abrir la cámara. Revisa los permisos del navegador y vuelve a intentar.",
        );
      }
    },
    [publishScan, requestWakeLock, stopCamera],
  );

  useEffect(() => {
    return () => {
      stopCamera(false);
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch((error) => {
          console.error("[remote-scanner-mobile] no se pudo cerrar AudioContext.", error);
        });
      }
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!cameraOn) return;
    const refreshWakeLock = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", refreshWakeLock);
    return () => document.removeEventListener("visibilitychange", refreshWakeLock);
  }, [cameraOn, requestWakeLock]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const nextTorchState = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }],
      } as TrackConstraintsWithTorch);
      setTorchOn(nextTorchState);
    } catch (error) {
      console.error("[remote-scanner-mobile] no se pudo cambiar la linterna.", error);
      setCameraError("No se pudo cambiar la linterna de la cámara.");
    }
  }

  function unlockAudio() {
    if (!audioContextRef.current && typeof window.AudioContext !== "undefined") {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current?.state === "suspended") {
      void audioContextRef.current.resume();
    }
  }

  const feedbackText = feedback
    ? feedback.status === "ok"
      ? `¡${feedback.name ?? "Producto"} agregado!`
      : feedback.status === "sin_stock"
        ? `Sin existencias${feedback.name ? `: ${feedback.name}` : ""}.`
        : feedback.status === "retirado"
          ? `Producto retirado${feedback.name ? `: ${feedback.name}` : ""}.`
          : feedback.status === "not_found"
            ? "Producto no registrado."
            : "No se pudo procesar el código."
    : null;
  const feedbackClass =
    feedback?.status === "ok"
      ? "bg-emerald-700 text-white"
      : feedback?.status === "sin_stock"
        ? "bg-amber-500 text-black"
        : "bg-destructive text-destructive-foreground";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-6">
      <header className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Tienda Don Juan
        </p>
        <h1 className="display-heading text-3xl font-semibold">Escáner de productos</h1>
        <p className="text-sm text-muted-foreground">
          {connection === "connected"
            ? "Celular conectado a la computadora."
            : connection === "offline"
              ? "Sin conexión con la computadora."
              : "Conectando con la computadora…"}
        </p>
      </header>

      {feedbackText && (
        <div
          role="status"
          aria-live="assertive"
          className={`rounded-xl px-4 py-3 text-center text-base font-semibold ${feedbackClass}`}
        >
          {feedbackText}
        </div>
      )}
      {sessionEnded && !session && (
        <div role="status" className="rounded-xl bg-muted px-4 py-3 text-center font-medium">
          Sesión finalizada
        </div>
      )}
      {cameraError && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {cameraError}
        </p>
      )}

      <div className="relative flex min-h-[42vh] flex-1 items-center justify-center overflow-hidden rounded-3xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 size-full object-cover ${cameraOn ? "block" : "hidden"}`}
          aria-label="Vista de la cámara para escanear productos"
        />
        {!cameraOn && (
          <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center text-white">
            {session && sessionReady ? (
              <Camera className="size-12" />
            ) : (
              <CameraOff className="size-12" />
            )}
            <p className="text-sm">
              {sessionReady
                ? session
                  ? "Activa la cámara para comenzar a escanear."
                  : "Vincula este celular escaneando el QR que aparece en la computadora."
                : "Cargando sesión…"}
            </p>
          </div>
        )}
        {cameraOn && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[20%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.2)]"
          />
        )}
      </div>

      {devices.length > 1 && (
        <label className="space-y-2 text-sm font-medium">
          Cámara
          <select
            aria-label="Seleccionar cámara"
            value={selectedDevice}
            onChange={(event) => {
              const nextDevice = event.target.value;
              setSelectedDevice(nextDevice);
              if (cameraOn) void startCamera(nextDevice);
            }}
            className="h-12 w-full rounded-xl border border-input bg-background px-3"
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Cámara ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Button
          type="button"
          disabled={!sessionReady || !session}
          className="h-12 rounded-xl text-base"
          onClick={() => {
            unlockAudio();
            if (cameraOn) stopCamera();
            else void startCamera(selectedDevice || undefined);
          }}
        >
          {cameraOn ? <CameraOff /> : <Camera />}
          {cameraOn ? "Detener cámara" : "Activar cámara"}
        </Button>
        {torchAvailable && cameraOn && (
          <Button
            type="button"
            variant="outline"
            className="size-12"
            aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
            onClick={() => void toggleTorch()}
          >
            {torchOn ? <FlashlightOff /> : <Flashlight />}
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Mantén el código dentro del recuadro. La cámara no funciona sin HTTPS.
      </p>
    </main>
  );
}
