"use client";
// ============================================================
// PLATFORM FILE — components/beon/asistente-chat.tsx
// Generado e inyectado por TuSistema. NO editar ni reescribir.
// La parte interactiva del módulo "Asistente IA". Solo Tailwind
// del scaffold: no importa nada de la app para que el módulo no
// se rompa cuando el sistema cambia. Lo único que importa es otro
// archivo de PLATAFORMA (`lib/beon-idioma.ts`), que la plataforma
// restaura en cada commit y el agente no edita.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { idiomaDelNegocio } from "@/lib/beon-idioma";
type Kind = "data" | "system" | "derived";
type Respuesta =
  | {
      ok: true;
      answer: string | null;
      kind: Kind;
      derived: string | null;
      tablesUsed: string[];
      rowCount: number;
      truncated: boolean;
      empty: boolean;
    }
  | { ok: false; code: string; message: string; creditsUrl?: string };
type Turno =
  | { rol: "yo"; texto: string }
  | { rol: "sistema"; texto: string; fuente?: string };
const COPY = {
  es: {
    titulo: "Asistente IA",
    bajada: "Preguntale a tu sistema: por tus datos o por cómo funciona.",
    prueba: "Modo prueba: te respondo con los datos de prueba de tu sistema.",
    proba: "Probá con:",
    placeholder: "Escribí tu pregunta…",
    enviar: "Preguntar",
    pensando: "Pensando…",
    costo: (n: string) => `Cada pregunta usa ≈ ${n} créditos de tu plan.`,
    basadoEn: (tablas: string) => `Basado en: ${tablas}`,
    vacio: "No encontré registros con ese filtro. ¿Querés que busque de otra forma?",
    derivado:
      "Puedo responder preguntas sobre los datos de tu sistema y sobre cómo funciona. Eso otro lo podés pedir desde el chat de TuSistema.",
    apagado:
      "El asistente está desactivado. Se vuelve a activar desde la configuración del sistema en TuSistema.",
    sinCreditos: "El dueño del sistema se quedó sin créditos en TuSistema.",
    cargarCreditos: "Cargar créditos",
    limpiar: "Empezar de nuevo",
    error: "No pudimos consultar tu sistema. Probá de nuevo en un momento.",
  },
  pt: {
    titulo: "Assistente IA",
    bajada: "Pergunte ao seu sistema: pelos seus dados ou por como funciona.",
    prueba: "Modo teste: respondo com os dados de teste do seu sistema.",
    proba: "Experimente:",
    placeholder: "Escreva sua pergunta…",
    enviar: "Perguntar",
    pensando: "Pensando…",
    costo: (n: string) => `Cada pergunta usa ≈ ${n} créditos do seu plano.`,
    basadoEn: (tablas: string) => `Com base em: ${tablas}`,
    vacio: "Não encontrei registros com esse filtro. Quer que eu busque de outro jeito?",
    derivado:
      "Posso responder perguntas sobre os dados do seu sistema e sobre como ele funciona. Isso outro você pode pedir no chat do TeuSistema.",
    apagado:
      "O assistente está desativado. Ele volta a ficar ativo na configuração do sistema, no TeuSistema.",
    sinCreditos: "O dono do sistema ficou sem créditos no TeuSistema.",
    cargarCreditos: "Carregar créditos",
    limpiar: "Começar de novo",
    error: "Não conseguimos consultar seu sistema. Tente de novo em um instante.",
  },
};
// El hilo vive en el navegador del dueño. No es un chat con memoria: es que
// salir de la pantalla y volver no te borre lo que preguntaste hace un minuto.
//
// `localStorage` y no la plataforma a propósito: resuelve el caso real (salir y
// volver, recargar, cerrar y abrir) sin una tabla nueva ni una llamada más en
// cada carga. Lo que NO cubre es verlo desde otro dispositivo.
const HILO_KEY = "beon:asistente:hilo";
// Tope de turnos guardados. Un hilo largo no aporta —el asistente no tiene
// memoria entre preguntas— y `localStorage` tiene un límite chico por origen.
const HILO_MAX = 40;
function leerHilo(): Turno[] {
  try {
    const crudo = localStorage.getItem(HILO_KEY);
    if (!crudo) return [];
    const d = JSON.parse(crudo);
    return Array.isArray(d) ? (d as Turno[]) : [];
  } catch {
    // Modo privado, cookies bloqueadas, JSON corrupto: se arranca vacío.
    return [];
  }
}
function guardarHilo(turnos: Turno[]): void {
  try {
    localStorage.setItem(HILO_KEY, JSON.stringify(turnos.slice(-HILO_MAX)));
  } catch {
    // Sin persistencia se sigue conversando igual: es una comodidad, no el
    // funcionamiento.
  }
}
/** El idioma sale del NEGOCIO, no del navegador de quien mira: el mismo
 *  criterio que el resto de la capa de plataforma (`lib/beon-idioma.ts`).
 *
 *  Mirar el idioma del navegador le mostraba el asistente en castellano al dueño
 *  brasileño que tiene la computadora en inglés, y en portugués a un empleado
 *  que abre un sistema argentino desde un teléfono en portugués. El idioma lo
 *  declaró el dueño y viaja en `NEXT_PUBLIC_BEON_LOCALE`.
 *
 *  Sin estado ni efecto a propósito: Next inlinea esa variable en build, así
 *  que el valor es el mismo en el servidor y en el primer render del cliente.
 *  Eso además borra el flash de castellano que tenía la versión con
 *  `useEffect`, que arrancaba en `es` y recién después se corregía. */
function usarCopy() {
  // La anotación explícita no es ceremonia: este archivo también lo typechequea
  // el repo de la plataforma, donde el alias `@/` apunta a otro lado y el
  // import resuelve a `any`. Sin ella, indexar `COPY` sería un `any` implícito.
  const idioma: "es" | "pt" = idiomaDelNegocio();
  return { copy: COPY[idioma], locale: idioma };
}
export function AsistenteChat({
  enabled,
  suggestedQuestions,
  creditsPerQuestionHint,
  ownerHasCredits,
  sandbox,
}: {
  enabled: boolean;
  suggestedQuestions: string[];
  creditsPerQuestionHint: string;
  ownerHasCredits: boolean;
  sandbox: boolean;
}) {
  const { copy, locale } = usarCopy();
  const [pregunta, setPregunta] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [hiloCargado, setHiloCargado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; url?: string } | null>(null);
  // El aviso de "sin créditos" se arma con el copy YA resuelto y no con una
  // copia en el estado inicial: así sigue el idioma del negocio aunque el
  // componente se vuelva a montar.
  const avisoVisible =
    aviso ??
    (ownerHasCredits
      ? null
      : { texto: copy.sinCreditos, url: "https://tusistema.ai/creditos" });
  const finRef = useRef<HTMLDivElement>(null);
  // El hilo de antes. Va en un efecto y no en el estado inicial porque el
  // servidor no tiene `localStorage`: leerlo en el render inicial daría un
  // mismatch de hidratación.
  useEffect(() => {
    const previos = leerHilo();
    if (previos.length > 0) setTurnos(previos);
    setHiloCargado(true);
  }, []);
  useEffect(() => {
    // Sólo después de rehidratar: guardar antes pisaría el hilo con el vacío
    // del primer render.
    if (hiloCargado) guardarHilo(turnos);
  }, [turnos, hiloCargado]);
  // `?q=` precarga la pregunta SIN enviarla: el botón del chat de TuSistema
  // sugiere, y el dueño decide si la manda (y si gasta el crédito).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setPregunta(q);
  }, []);
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnos, enviando]);
  if (!enabled) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-2xl font-bold">{copy.titulo}</h1>
        <p className="mt-3 text-sm opacity-70">{copy.apagado}</p>
      </div>
    );
  }
  async function enviar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setPregunta("");
    setAviso(null);
    setTurnos((t) => [...t, { rol: "yo", texto: limpio }]);
    setEnviando(true);
    try {
      const res = await fetch("/api/beon/asistente/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: limpio, locale }),
      });
      const data = (await res.json()) as Respuesta;
      if (!data.ok) {
        setAviso({ texto: data.message || copy.error, url: data.creditsUrl });
        return;
      }
      if (data.kind === "derived") {
        setTurnos((t) => [...t, { rol: "sistema", texto: copy.derivado }]);
        return;
      }
      if (data.empty) {
        setTurnos((t) => [
          ...t,
          { rol: "sistema", texto: data.answer || copy.vacio },
        ]);
        return;
      }
      // Solo las TABLAS, sin el conteo de filas: ese número es del resultado
      // del SELECT, no de los datos del dueño. Con un agregado siempre da 1, y
      // "Basado en: Pedido (1 registro)" debajo de "no encontré pedidos para
      // mañana" no dice nada cierto (visto en la prueba del 2026-09-09).
      const fuente =
        data.kind === "data" && data.tablesUsed.length
          ? copy.basadoEn(data.tablesUsed.join(", "))
          : undefined;
      setTurnos((t) => [
        ...t,
        { rol: "sistema", texto: data.answer || copy.error, fuente },
      ]);
    } catch {
      setAviso({ texto: copy.error });
    } finally {
      setEnviando(false);
    }
  }
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{copy.titulo}</h1>
          {turnos.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setTurnos([]);
                guardarHilo([]);
              }}
              className="shrink-0 text-xs opacity-60 underline hover:opacity-100"
            >
              {copy.limpiar}
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm opacity-70">{copy.bajada}</p>
        {sandbox ? (
          <p className="mt-2 rounded-lg bg-black/5 px-3 py-2 text-xs opacity-80">
            {copy.prueba}
          </p>
        ) : null}
      </header>
      {turnos.length === 0 && suggestedQuestions.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">
            {copy.proba}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => enviar(q)}
                className="rounded-full border border-black/10 px-3 py-1.5 text-sm transition-colors hover:bg-black/5"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {turnos.map((turno, i) => (
          <div
            key={i}
            className={
              turno.rol === "yo"
                ? "self-end rounded-2xl bg-black/[0.06] px-4 py-2.5 text-sm"
                : "self-start rounded-2xl border border-black/10 px-4 py-3 text-sm"
            }
          >
            <p className="whitespace-pre-wrap">{turno.texto}</p>
            {turno.rol === "sistema" && turno.fuente ? (
              <p className="mt-2 text-xs opacity-60">{turno.fuente}</p>
            ) : null}
          </div>
        ))}
        {enviando ? (
          <p className="self-start px-4 py-2 text-sm opacity-60">{copy.pensando}</p>
        ) : null}
        <div ref={finRef} />
      </div>
      {avisoVisible ? (
        <p className="rounded-lg border border-black/10 px-3 py-2 text-sm">
          {avisoVisible.texto}{" "}
          {avisoVisible.url ? (
            <a
              href={avisoVisible.url}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {copy.cargarCreditos}
            </a>
          ) : null}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(pregunta);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          // Enter manda, explícito. El submit implícito del navegador ya lo
          // hace, pero es la única forma de mandar que el dueño va a usar sin
          // pensar: dejarla dependiendo de un comportamiento implícito es
          // dejarla dependiendo de que nada la rompa nunca.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar(pregunta);
            }
          }}
          placeholder={copy.placeholder}
          className="min-w-0 flex-1 rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none focus:border-black/35"
        />
        <button
          type="submit"
          disabled={enviando || !pregunta.trim()}
          className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {copy.enviar}
        </button>
      </form>
      {creditsPerQuestionHint ? (
        <p className="text-xs opacity-55">{copy.costo(creditsPerQuestionHint)}</p>
      ) : null}
    </div>
  );
}
