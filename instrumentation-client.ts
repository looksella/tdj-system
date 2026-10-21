// Inyectado por el pipeline de TuSistema.AI. Captura errores runtime
// client-side y los emite al iframe parent (la plataforma).
// NO modificar — sobreescrito automáticamente en cada iteración.
//
// Cubre solo las dos categorías que representan errores REALES del
// código del usuario (no warnings/ruido de Next/React):
//   - window.onerror: excepciones no capturadas en el render o handlers
//   - unhandledrejection: promesas rechazadas que nadie .catch()
//
// console.error queda DELIBERADAMENTE fuera. Next/React emiten warnings
// vía console.error (Failed to fetch RSC payload, hidratación, fast
// refresh, etc.) que NO son bugs del código generado — son ruido del
// entorno dev. Si el usuario los viera, abriríamos cards "Detecté un
// problema" sobre cosas que el agente no puede arreglar.
const seen = new Set<string>();
function report(payload: {
  kind: string;
  message: string;
  stack?: string;
  source?: string;
}) {
  const sig = `${payload.kind}:${payload.message}`.slice(0, 500);
  if (seen.has(sig)) return;
  seen.add(sig);
  try {
    window.parent?.postMessage(
      { __beon: true, type: "runtime_error", payload },
      "*",
    );
  } catch {
    // no-op intencional: sin red propia no hay otro destino
  }
}
window.addEventListener("error", (e: ErrorEvent) => {
  report({
    kind: "window.onerror",
    message: e.message,
    stack: e.error?.stack?.slice(0, 4000),
    source: e.filename,
  });
});
window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  const reason = e.reason as { message?: string; stack?: string } | undefined;
  report({
    kind: "unhandledrejection",
    message: String(reason?.message ?? e.reason),
    stack: reason?.stack?.slice(0, 4000),
  });
});
// Latido de liveness (SPEC_SANDBOX_STATE_RECONCILE). La plataforma observa
// estos mensajes desde el iframe parent: si dejan de llegar mientras el
// sandbox dice estar "live", asume que el sandbox murió (502
// SANDBOX_NOT_LISTENING) y dispara una recuperación. Es incondicional —
// late siempre que este bundle ejecute. Un sandbox muerto nunca corre este
// JS, así que el silencio es señal binaria de muerte. Sin esto, el parent
// no tiene forma de distinguir una app sana de la página de error 502 de
// Vercel (ambas disparan el ``load`` del iframe; el contenido es cross-origin).
function beat() {
  try {
    window.parent?.postMessage({ __beon: true, type: "alive" }, "*");
  } catch {
    // no-op: sin parent no hay a quién avisar
  }
}
beat();
setInterval(beat, 5000);
// Señal de uso real (SPEC_SANDBOX_AHORRO Bloque 4). Distinta del latido de
// arriba: el latido dice "la app está viva", esto dice "hay alguien usándola".
// La plataforma apaga el sandbox de preview cuando nadie lo toca, y el dueño
// probando SU app dentro del iframe es invisible desde afuera (cross-origin).
// Sin este aviso, quien clickea dentro del preview sin tocar nunca el chat
// se quedaría sin preview a los 15 minutos.
//
// Throttleado a 1 mensaje cada 15 segundos: la plataforma solo necesita saber
// que hubo actividad en la ventana, no cuánta. En una app publicada no hay
// parent que escuche y el postMessage no hace nada.
let lastActivitySent = 0;
function reportActivity() {
  const now = Date.now();
  if (now - lastActivitySent < 15000) return;
  lastActivitySent = now;
  try {
    window.parent?.postMessage({ __beon: true, type: "user_activity" }, "*");
  } catch {
    // no-op: sin parent no hay a quién avisar
  }
}
for (const evt of ["pointerdown", "keydown", "scroll"] as const) {
  window.addEventListener(evt, reportActivity, { passive: true, capture: true });
}
// Aviso de ruta (barra de direcciones del preview,
// SPEC_BARRA_DIRECCIONES_PREVIEW Bloque 4). El parent no puede leer la URL
// de este iframe —es cross-origin— así que si la app no avisa, la barra
// queda mostrando la última ruta que el parent pidió y no la real.
// En una app publicada no hay parent escuchando y esto no hace nada.
//
// Protocolo de UNA sola dirección (app → parent), a propósito: el parent
// nunca manda comandos de navegación por acá. El App Router de Next navega
// vía History API, así que se cubre parcheando pushState/replaceState
// —conservando y delegando en la implementación original— más popstate
// (atrás/adelante del browser) y un aviso al arranque del módulo (carga
// directa de una ruta).
let lastReportedPath = "";
function reportRoute() {
  // El parent agrega dos params al src del iframe (buildSandboxSrc):
  // `__beon_v`, el cache-bust de cada recarga, y `__beon_r`, el reintento de
  // carga durante el warm-up. Los dos son plomería interna del preview, no
  // parte de la ruta de la app: se filtran ANTES de reportar, o la barra de
  // direcciones mostraría "/admin?__beon_v=1". El dedupe de abajo opera sobre
  // el path ya filtrado, así dos cargas que solo difieren en esos params no se
  // re-reportan.
  const params = new URLSearchParams(window.location.search);
  params.delete("__beon_v");
  params.delete("__beon_r");
  const search = params.toString();
  const path = window.location.pathname + (search ? `?${search}` : "");
  if (path === lastReportedPath) return; // dedupe (replaceState de Next mete ráfagas)
  lastReportedPath = path;
  try {
    window.parent?.postMessage(
      { __beon: true, type: "route_changed", payload: { path } },
      "*",
    );
  } catch {
    // no-op: sin parent no hay a quién avisar
  }
}
// ── Telemetría de navegación (SPEC_PREVIEW_RENDIMIENTO_NAVEGACION Bloque 4) ──
// Mide lo que el dueño SIENTE al navegar su sistema en el preview: desde el
// pushState del App Router hasta que termina el fetch RSC de la ruta destino
// (la request `?_rsc=` que Next dispara para renderizarla). El parent batchea
// y persiste; `first_visit` separa pantalla fría (compila on-demand) de
// caliente en el tablero. En una app publicada no hay parent que escuche y el
// postMessage no hace nada, como el resto del archivo. Una navegación servida
// entera del Router Cache no dispara fetch RSC y no genera medición — lo que
// se mide es justo la navegación que paga red.
const navVisitedRoutes = new Set<string>([window.location.pathname]);
let pendingNav: { from: string; to: string; startedAt: number } | null = null;
const NAV_TIMING_MAX_MS = 30_000; // una nav colgada no se casa con un RSC tardío
if (typeof PerformanceObserver !== "undefined") {
  try {
    const navObserver = new PerformanceObserver((list) => {
      const nav = pendingNav;
      if (!nav) return;
      if (performance.now() - nav.startedAt > NAV_TIMING_MAX_MS) {
        pendingNav = null;
        return;
      }
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceResourceTiming;
        if (!e.name.includes("_rsc=")) continue;
        let path: string;
        try {
          path = new URL(e.name).pathname;
        } catch {
          continue;
        }
        if (path !== nav.to) continue;
        pendingNav = null;
        const firstVisit = !navVisitedRoutes.has(nav.to);
        navVisitedRoutes.add(nav.to);
        try {
          window.parent?.postMessage(
            {
              __beon: true,
              type: "nav_timing",
              payload: {
                from: nav.from,
                to: nav.to,
                ms: Math.max(0, Math.round(e.responseEnd - nav.startedAt)),
                rsc_bytes: Math.round(e.transferSize || e.encodedBodySize || 0),
                first_visit: firstVisit,
              },
            },
            "*",
          );
        } catch {
          // no-op: sin parent no hay a quién avisar
        }
        break;
      }
    });
    navObserver.observe({ type: "resource", buffered: false });
  } catch {
    // no-op: un browser sin resource timing simplemente no mide
  }
}
const originalPushState = history.pushState;
history.pushState = function (
  this: History,
  ...args: Parameters<History["pushState"]>
) {
  const navFrom = window.location.pathname;
  const navStart = performance.now();
  originalPushState.apply(this, args);
  const navTo = window.location.pathname;
  // Solo navegaciones que cambian de pantalla: un pushState del mismo path
  // (query/filtros) no compila ni refetchea la ruta.
  pendingNav = navTo !== navFrom
    ? { from: navFrom, to: navTo, startedAt: navStart }
    : null;
  reportRoute();
};
const originalReplaceState = history.replaceState;
history.replaceState = function (
  this: History,
  ...args: Parameters<History["replaceState"]>
) {
  originalReplaceState.apply(this, args);
  reportRoute();
};
window.addEventListener("popstate", reportRoute);
reportRoute();
// ───────────────────────────────────────────────────────────────────────────
// Visual edits — overlay de edición (SPEC_VISUAL_EDITS Bloque 3).
//
// Módulo DORMANTE: solo se activa cuando el iframe parent (el chat de
// TuSistema) envía `vedit:activate` desde un origin confiable. Doble candado
// en producción: (1) nadie confiable embebe la app publicada, y (2) los
// atributos `data-beon-loc` solo existen en el sandbox dev (el tagger es
// dev-only) — sin tags no hay nada editable.
//
// Cero deps, DOM vanilla. Las ediciones son optimistas (mutan el DOM al
// instante); la persistencia real la hace el parent via codemod + commit.
// ───────────────────────────────────────────────────────────────────────────
// Dominios de la plataforma que pueden activar el overlay. La lista la inyecta
// la plataforma en `NEXT_PUBLIC_PLATFORM_DOMAINS` (separada por comas), porque
// desde SPEC_MERCADOS_02 el chat vive en más de un dominio: `tusistema.ai` y
// `teusistema.ai` (Brasil). Si la env no llega, queda `tusistema.ai` solo, que
// es el comportamiento de siempre.
const VEDIT_PLATFORM_DOMAINS = (
  process.env.NEXT_PUBLIC_PLATFORM_DOMAINS || "tusistema.ai"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
// El dominio primario va SIEMPRE, aunque la env llegue con un typo o sin él:
// perderlo deja al visual edit sin responder y sin decir por qué.
if (!VEDIT_PLATFORM_DOMAINS.includes("tusistema.ai")) {
  VEDIT_PLATFORM_DOMAINS.push("tusistema.ai");
}
const VEDIT_TRUSTED = [
  // Cualquier subdominio de cada dominio de plataforma: prod (apex / www) y
  // staging. Antes solo matcheaba (www.)?tusistema.ai, así que en staging el
  // `vedit:activate` se descartaba y el overlay nunca se prendía.
  ...VEDIT_PLATFORM_DOMAINS.map(
    (d) =>
      new RegExp(`^https://([a-z0-9-]+\\.)?${d.replace(/\./g, "\\.")}$`),
  ),
  /^http:\/\/localhost:\d+$/,
];
type VeditKind = "set_text" | "set_classes" | "delete_element";
interface VeditOp {
  id: string;
  kind: VeditKind;
  loc: string;
  tag: string;
  old_text?: string;
  new_text?: string;
  add?: string[];
  remove?: string[];
  /** Cuántas copias del mismo loc hay en el DOM (componentes repetidos). */
  dom_count?: number;
  /** Solo para set_text con dom_count > 1: true si todas las copias mostraban
   *  el MISMO texto (edita un literal compartido → cambia en todas). false si
   *  los textos diferían (.map sobre array → el codemod edita una sola
   *  entrada). El parent usa esto para no avisar "cambiado en N lugares"
   *  cuando en realidad solo cambió una copia. */
  dom_shared_text?: boolean;
}
interface VeditUndoEntry {
  op: VeditOp;
  revert: () => void;
}
// Escaleras Tailwind cerradas (enumeraciones de schema, no heurísticas):
// cada control del toolbar remueve el resto de su grupo y agrega el elegido.
const VEDIT_TEXT_SIZES = [
  "text-xs", "text-sm", "text-base", "text-lg", "text-xl",
  "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl",
];
const VEDIT_SIZE_PX: Record<string, string> = {
  "text-xs": "12px", "text-sm": "14px", "text-base": "16px", "text-lg": "18px",
  "text-xl": "20px", "text-2xl": "24px", "text-3xl": "30px", "text-4xl": "36px",
  "text-5xl": "48px", "text-6xl": "60px",
};
const VEDIT_ALIGNS = ["text-left", "text-center", "text-right"];
const VEDIT_PADDINGS = ["p-0", "p-1", "p-2", "p-3", "p-4", "p-6", "p-8", "p-10", "p-12"];
const VEDIT_MARGINS = ["m-0", "m-1", "m-2", "m-3", "m-4", "m-6", "m-8", "m-10", "m-12"];
const VEDIT_COLORS: [string, string][] = [
  ["black", "#000000"], ["white", "#ffffff"], ["gray-500", "#6b7280"],
  ["red-500", "#ef4444"], ["orange-500", "#f97316"], ["amber-500", "#f59e0b"],
  ["green-600", "#16a34a"], ["blue-600", "#2563eb"], ["indigo-600", "#4f46e5"],
  ["purple-600", "#9333ea"], ["pink-600", "#db2777"],
];
class VeditEditor {
  private parentOrigin: string | null = null;
  private active = false;
  private stack: VeditUndoEntry[] = [];
  private selected: HTMLElement | null = null;
  /** SPEC_MEJORAS_SISTEMAS_BASE Bloque 4 — los módulos que el dueño PUEDE
   *  ocultar. Llegan en el `vedit:activate`: el overlay no puede consultarle
   *  a la API de la plataforma (es cross-origin y no tiene la sesión). Vacío
   *  = la acción no existe, que es el estado por defecto y el de todo
   *  proyecto que no sea un sistema base. */
  private modulosOcultables: string[] = [];
  private hoverBox: HTMLDivElement | null = null;
  private selBoxes: HTMLDivElement[] = [];
  private toolbar: HTMLDivElement | null = null;
  private repeatNote: HTMLDivElement | null = null;
  private dynamicNote: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private rafPending = false;
  private opSeq = 0;
  private editingText: { el: HTMLElement; original: string; textNode: Text | null } | null = null;
  /** Locs que el codemod reportó como fallidos en el último guardado, con su
   *  status (dynamic_content / overlap_conflict / drift / error) y reason. La
   *  nota contextual al re-seleccionar el elemento sale de acá; el caso
   *  dynamic_content además ofrece el CTA al chat. */
  private failedLocs = new Map<string, { status: string; reason?: string }>();
  /** Timestamp del último flush_ok. Durante ~1.5s tras guardar, el HMR está
   *  recompilando y los data-beon-loc del DOM pueden estar stale (líneas
   *  viejas). Bloqueamos nuevas ediciones esa ventana para evitar drift. */
  private lastFlushOk = 0;
  private inHmrCooldown(): boolean {
    return Date.now() - this.lastFlushOk < 1500;
  }
  // ── activación ──────────────────────────────────────────────────────────
  handleMessage(e: MessageEvent): void {
    if (!VEDIT_TRUSTED.some((rx) => rx.test(e.origin))) return;
    const data = e.data as { __beon?: boolean; type?: string; payload?: unknown };
    if (!data || data.__beon !== true || typeof data.type !== "string") return;
    if (data.type === "vedit:activate") {
      const payload = data.payload as { modulosOcultables?: unknown } | undefined;
      this.modulosOcultables = Array.isArray(payload?.modulosOcultables)
        ? payload.modulosOcultables.filter((s): s is string => typeof s === "string")
        : [];
      this.enable(e.origin);
    }
    else if (data.type === "vedit:deactivate") {
      this.disable((data.payload as { revert?: boolean } | undefined)?.revert === true);
    } else if (data.type === "vedit:flush_ok") this.onFlushOk();
    else if (data.type === "vedit:flush_error") {
      const payload = data.payload as
        | { failed_ids?: string[]; failed?: { opId: string; status: string; reason?: string }[] }
        | undefined;
      this.onFlushError(payload?.failed_ids ?? [], payload?.failed ?? []);
    }
  }
  private emit(type: string, payload: unknown): void {
    if (!this.parentOrigin) return;
    try {
      window.parent?.postMessage({ __beon: true, type, payload }, this.parentOrigin);
    } catch {
      // no-op
    }
  }
  private enable(origin: string): void {
    if (this.active) return;
    this.parentOrigin = origin;
    this.active = true;
    // Señal para cualquier listener global de la app (ej. la barra de
    // navegación que el builder genera): mientras editamos, no debe reaccionar
    // a clicks. Cinturón extra al stopPropagation de abajo.
    (globalThis as unknown as { __beonVeditActive?: boolean }).__beonVeditActive = true;
    this.injectStyles();
    this.hoverBox = this.mkBox("beon-vedit-hover");
    document.addEventListener("mouseover", this.onMouseOver, true);
    // El click va sobre ``window`` (no ``document``) a propósito: en capture
    // phase ``window`` precede a ``document`` SIEMPRE, sin importar el orden de
    // registración. Así el overlay intercepta el click ANTES que la barra de
    // progreso de la app (que escucha en ``document`` capture desde el boot) y
    // el ``stopPropagation`` de onClick evita que esa barra siquiera arranque.
    // En ``document`` el overlay corría segundo y la barra quedaba pegada al
    // 90% (la navegación se cancelaba pero el progreso ya había arrancado).
    window.addEventListener("click", this.onClick, true);
    document.addEventListener("dblclick", this.onDblClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("scroll", this.onReposition, true);
    window.addEventListener("resize", this.onReposition);
    this.emitStatus();
  }
  private disable(revert: boolean): void {
    if (!this.active) return;
    if (revert) {
      while (this.stack.length) this.stack.pop()!.revert();
    }
    this.stack = [];
    this.active = false;
    (globalThis as unknown as { __beonVeditActive?: boolean }).__beonVeditActive = false;
    // Los locs cambian entre sesiones de edición (el código avanza) —
    // arrastrar el set viejo daría badges falsos.
    this.failedLocs.clear();
    this.cancelTextEdit();
    this.clearSelection();
    this.hoverBox?.remove();
    this.hoverBox = null;
    this.styleEl?.remove();
    this.styleEl = null;
    document.removeEventListener("mouseover", this.onMouseOver, true);
    window.removeEventListener("click", this.onClick, true);
    document.removeEventListener("dblclick", this.onDblClick, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("scroll", this.onReposition, true);
    window.removeEventListener("resize", this.onReposition);
    this.emitStatus();
  }
  private onFlushOk(): void {
    this.stack = [];
    // Los locs del DOM quedan stale hasta que HMR recompile — soltar la
    // selección + cooldown de 1.5s evita emitir ops con locs viejos. El
    // re-render del HMR repone elementos frescos con locs nuevos, así que
    // pasada la ventana el mapa queda re-sincronizado solo.
    this.lastFlushOk = Date.now();
    // Guardado 100% exitoso: no quedan fallidos que señalizar.
    this.failedLocs.clear();
    this.clearSelection();
    this.emitStatus();
  }
  private onFlushError(
    failedIds: string[], failedDetail: { opId: string; status: string; reason?: string }[],
  ): void {
    // Recordar los locs fallidos ANTES de filtrar el stack (necesitamos el op
    // para mapear opId → loc). La nota contextual al re-seleccionar usa esto.
    const failedLocList: string[] = [];
    for (const f of failedDetail) {
      const entry = this.stack.find((e) => e.op.id === f.opId);
      if (!entry) continue;
      this.failedLocs.set(entry.op.loc, { status: f.status, reason: f.reason });
      failedLocList.push(entry.op.loc);
    }
    const failed = new Set(failedIds);
    const keep: VeditUndoEntry[] = [];
    for (const entry of this.stack) {
      if (failed.has(entry.op.id)) entry.revert();
      else keep.push(entry);
    }
    this.stack = keep;
    // Señalizar qué NO se guardó: resaltar los elementos fallidos y llevar el
    // primero al viewport. Se hace DESPUÉS del revert porque el revert de un
    // delete_element repone el nodo (con su data-beon-loc) en el DOM.
    this.flashFailed(failedLocList);
    if (this.selected) this.refreshSelection();
    this.emitStatus();
  }
  /** Marca los elementos fallidos con un outline rojo temporal y hace scroll
   *  al primero. Best-effort: si un loc no tiene nodo en el DOM, se saltea. */
  private flashFailed(locs: string[]): void {
    let first = true;
    for (const loc of locs) {
      const el = document.querySelector<HTMLElement>(`[data-beon-loc="${loc}"]`);
      if (!el) continue;
      el.setAttribute("data-beon-vedit-failed", "");
      window.setTimeout(() => el.removeAttribute("data-beon-vedit-failed"), 2500);
      if (first) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        first = false;
      }
    }
  }
  private emitStatus(): void {
    this.emit("vedit:status", { pendingCount: this.stack.length, active: this.active });
  }
  // ── helpers de DOM ──────────────────────────────────────────────────────
  private injectStyles(): void {
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = [
      ".beon-vedit-box{position:fixed;pointer-events:none;z-index:2147483600;border:1.5px dashed #3A69FF;border-radius:3px;display:none}",
      ".beon-vedit-box.sel{border:2px solid #7432FF;background:rgba(116,50,255,.04)}",
      ".beon-vedit-box .beon-vedit-tag{position:absolute;top:-22px;left:-2px;background:#7432FF;color:#fff;font:600 11px/1.6 ui-sans-serif,system-ui;padding:1px 6px;border-radius:3px;white-space:nowrap}",
      ".beon-vedit-toolbar{position:fixed;z-index:2147483601;background:#20222d;border-radius:8px;padding:4px;display:flex;gap:2px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.35);font:500 12px ui-sans-serif,system-ui;flex-wrap:nowrap;white-space:nowrap;max-width:calc(100vw - 16px);overflow-x:auto;scrollbar-width:none}",
      ".beon-vedit-toolbar button,.beon-vedit-toolbar select{background:transparent;color:#fcfcfd;border:0;border-radius:5px;padding:4px 7px;cursor:pointer;font:inherit}",
      ".beon-vedit-toolbar button:hover{background:#363a4c}",
      ".beon-vedit-toolbar select{background:#363a4c}",
      ".beon-vedit-toolbar .sep{width:1px;height:16px;background:#4d516c;margin:0 2px}",
      ".beon-vedit-swatches{display:none;position:absolute;top:100%;left:0;margin-top:4px;background:#20222d;border-radius:8px;padding:6px;grid-template-columns:repeat(6,18px);gap:4px;box-shadow:0 8px 24px rgba(0,0,0,.35)}",
      ".beon-vedit-swatches.open{display:grid}",
      ".beon-vedit-swatches button{width:18px;height:18px;border-radius:4px;border:1px solid #4d516c;padding:0}",
      ".beon-vedit-note{position:fixed;z-index:2147483601;background:#363a4c;color:#fcfcfd;font:500 11px ui-sans-serif,system-ui;padding:3px 8px;border-radius:5px;pointer-events:none}",
      "[data-beon-vedit-editing]{outline:2px solid #39b96a !important;outline-offset:2px}",
      "[data-beon-vedit-failed]{outline:2px solid #e5484d !important;outline-offset:2px;transition:outline .2s}",
    ].join("\n");
    document.head.appendChild(this.styleEl);
  }
  private mkBox(cls: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = `beon-vedit-box ${cls}`;
    document.body.appendChild(el);
    return el;
  }
  private taggedAncestor(target: EventTarget | null): HTMLElement | null {
    let el = target as HTMLElement | null;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.beonLoc) return el;
      el = el.parentElement;
    }
    return null;
  }
  private placeBox(box: HTMLDivElement, el: HTMLElement, tagLabel?: string): void {
    const r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${r.left - 2}px`;
    box.style.top = `${r.top - 2}px`;
    box.style.width = `${r.width + 4}px`;
    box.style.height = `${r.height + 4}px`;
    if (tagLabel) {
      let tag = box.querySelector<HTMLElement>(".beon-vedit-tag");
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "beon-vedit-tag";
        box.appendChild(tag);
      }
      tag.textContent = tagLabel;
    }
  }
  private onReposition = (): void => {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.selected && this.selBoxes.length) {
        this.refreshSelection();
        // La toolbar acompaña a la selección en scroll/resize (sin esto
        // queda flotando donde estaba el elemento antes del scroll).
        this.positionToolbar();
      }
      if (this.hoverBox) this.hoverBox.style.display = "none";
    });
  };
  // ── interacción ─────────────────────────────────────────────────────────
  private onMouseOver = (e: MouseEvent): void => {
    if (!this.active || this.editingText) return;
    const el = this.taggedAncestor(e.target);
    if (!el || el === this.selected) {
      if (this.hoverBox) this.hoverBox.style.display = "none";
      return;
    }
    if (this.hoverBox) this.placeBox(this.hoverBox, el, `<${el.tagName.toLowerCase()}>`);
  };
  private onClick = (e: MouseEvent): void => {
    if (!this.active) return;
    if (this.toolbar?.contains(e.target as Node)) return;
    if (this.dynamicNote?.contains(e.target as Node)) return;
    if (this.editingText) {
      // Contención, no identidad: cuando el elemento editado es un ancestro
      // taggeado (ej. <li> que envuelve <a><Icon/>{label}</a>), los clicks para
      // posicionar el cursor caen en descendientes (<a>, <svg>, nodo de texto).
      // Con `!==` esos clicks confirmaban y desmontaban el contenteditable apenas
      // entrabas a editar. Solo confirma un click realmente FUERA del editable.
      if (!this.editingText.el.contains(e.target as Node)) this.confirmTextEdit();
      return;
    }
    const el = this.taggedAncestor(e.target);
    // En modo edición, TODO click sobre la app se intercepta (links, botones,
    // submits no disparan). Los clicks fuera de elementos taggeados solo
    // limpian la selección.
    e.preventDefault();
    e.stopPropagation();
    if (this.inHmrCooldown()) return; // HMR recompilando: locs stale
    if (!el) {
      this.clearSelection();
      return;
    }
    this.select(el);
  };
  private onDblClick = (e: MouseEvent): void => {
    if (!this.active || this.editingText) return;
    const el = this.taggedAncestor(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.inHmrCooldown()) return; // HMR recompilando: locs stale
    this.startTextEdit(el);
  };
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (this.editingText) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.confirmTextEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelTextEdit();
      }
      return;
    }
    if (e.key === "Escape") {
      this.clearSelection();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      this.undoLast();
    }
  };
  // ── selección ───────────────────────────────────────────────────────────
  private select(el: HTMLElement): void {
    this.clearSelection();
    this.selected = el;
    this.refreshSelection();
    this.buildToolbar(el);
  }
  private refreshSelection(): void {
    const el = this.selected;
    if (!el) return;
    for (const b of this.selBoxes) b.remove();
    this.selBoxes = [];
    this.repeatNote?.remove();
    this.repeatNote = null;
    const loc = el.dataset.beonLoc!;
    const copies = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-beon-loc="${CSS.escape(loc)}"]`),
    );
    for (const copy of copies) {
      const box = this.mkBox("sel");
      box.classList.add("sel");
      this.placeBox(box, copy, copy === el ? `<${el.tagName.toLowerCase()}>` : undefined);
      this.selBoxes.push(box);
    }
    // Aviso "se repite N veces": SOLO cuando todas las copias muestran el
    // MISMO texto. Ese caso edita un literal compartido del JSX → el cambio
    // aplica a todas las copias. Cuando los textos difieren, el texto viene de
    // un array que se mapea (`items.map(i => <a>{i.label}</a>)`): NO marcamos
    // el loc como dinámico proactivamente — el codemod ahora resuelve esos
    // arrays literales del mismo archivo (SPEC_VISUAL_EDITS_INLINE_DATA_
    // RESOLUTION). Dejamos que intente y que el codemod decida: si vuelve
    // dynamic_content real, `onFlushError` alimenta `failedLocs` y el badge
    // "viene de tus datos" sale en el próximo doble-click.
    if (copies.length > 1) {
      const texts = new Set(
        copies.map((c) => (c.textContent ?? "").trim()),
      );
      if (texts.size === 1) {
        const r = el.getBoundingClientRect();
        this.repeatNote = document.createElement("div");
        this.repeatNote.className = "beon-vedit-note";
        this.repeatNote.textContent =
          `Este elemento se repite ${copies.length} veces — el cambio aplica a todas las copias`;
        this.repeatNote.style.left = `${r.left}px`;
        this.repeatNote.style.top = `${r.bottom + 6}px`;
        document.body.appendChild(this.repeatNote);
      }
    }
    // Nota de "por qué no se guardó" (SPEC B6.1 + guardado parcial): si el
    // último guardado reportó este loc como fallido, explicar la causa al
    // re-seleccionarlo. dynamic_content además ofrece el CTA al chat.
    this.dynamicNote?.remove();
    this.dynamicNote = null;
    const failure = this.failedLocs.get(loc);
    if (failure) {
      const r = el.getBoundingClientRect();
      const note = document.createElement("div");
      note.className = "beon-vedit-note";
      note.style.pointerEvents = "auto";
      if (failure.status === "dynamic_content") {
        const label = document.createElement("span");
        label.textContent = "🔌 Este texto viene de tus datos · ";
        const cta = document.createElement("button");
        cta.type = "button";
        cta.textContent = "Pedir el cambio al chat";
        cta.style.cssText =
          "background:none;border:0;color:#6C8EFF;cursor:pointer;font:inherit;text-decoration:underline;padding:0";
        cta.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.emit("vedit:request_chat", {
            loc,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? "").trim().slice(0, 120),
          });
          this.clearSelection();
        });
        note.appendChild(label);
        note.appendChild(cta);
      } else {
        note.textContent = this.failureNoteText(failure.status);
      }
      const repeatOffset = this.repeatNote ? 26 : 0;
      note.style.left = `${r.left}px`;
      note.style.top = `${r.bottom + 6 + repeatOffset}px`;
      document.body.appendChild(note);
      this.dynamicNote = note;
    }
    if (this.hoverBox) this.hoverBox.style.display = "none";
  }
  /** Texto de la nota contextual por status de fallo (sin CTA). */
  private failureNoteText(status: string): string {
    if (status === "overlap_conflict")
      return "⚠️ Este cambio se pisa con otro. Guardalos por separado, de a uno.";
    if (status === "drift")
      return "🔄 La app cambió mientras editabas. Recargá el modo edición.";
    return "⚠️ No pudimos aplicar este cambio.";
  }
  private clearSelection(): void {
    this.selected = null;
    for (const b of this.selBoxes) b.remove();
    this.selBoxes = [];
    this.toolbar?.remove();
    this.toolbar = null;
    this.modulosOcultables = [];
    this.repeatNote?.remove();
    this.repeatNote = null;
    this.dynamicNote?.remove();
    this.dynamicNote = null;
  }
  // ── edición de texto inline ─────────────────────────────────────────────
  private isTextEditable(el: HTMLElement): boolean {
    if (["INPUT", "TEXTAREA", "SELECT", "IMG", "VIDEO"].includes(el.tagName)) return false;
    if (el.childNodes.length === 0) return true; // vacío: permitir agregar texto
    // Editable si en TODO el subárbol hay un único nodo de texto con contenido.
    // Cubre `<span>X</span>`, `<a><Icon/>X</a>` y el caso real
    // `<li><Link><Icon/>X</Link></li>` (el tagger solo taggea elementos nativos,
    // así que el loc cae en el <li> y el texto vive dentro de componentes no
    // taggeados). Los íconos svg no aportan nodos de texto. Si hay dos textos
    // (card con título + subtítulo) → no editable, se desambigua clickeando el
    // elemento nativo más interno (que también está taggeado).
    return this.singleEditableTextNode(el) !== null;
  }
  /** El único nodo de texto con contenido del SUBÁRBOL de `el`, descendiendo
   *  por wrappers (componentes, íconos). null si hay cero o más de uno. */
  private singleEditableTextNode(el: HTMLElement): Text | null {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let found: Text | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.nodeValue ?? "").trim().length === 0) continue; // whitespace
      if (found) return null; // más de un nodo de texto en el subárbol
      found = n as Text;
    }
    return found;
  }
  private startTextEdit(el: HTMLElement): void {
    if (!this.isTextEditable(el)) return;
    // Si ya sabemos (heurística de copies con textos distintos o fallo
    // previo) que el texto viene de datos, NO entramos a edit mode.
    // La selección sí se hace para que se vea el badge "viene de tus
    // datos" + CTA al chat.
    const loc = el.dataset.beonLoc;
    if (loc && this.failedLocs.get(loc)?.status === "dynamic_content") {
      this.select(el);
      return;
    }
    this.select(el);
    // En el caso mixto editamos solo el nodo de texto (el ícono queda afuera
    // de la selección). En la hoja simple no hay nodo a aislar.
    const textNode = el.children.length === 0 ? null : this.singleEditableTextNode(el);
    this.editingText = { el, original: el.textContent ?? "", textNode };
    el.setAttribute("data-beon-vedit-editing", "1");
    el.setAttribute("contenteditable", "plaintext-only");
    el.focus();
    const range = document.createRange();
    if (textNode) range.selectNodeContents(textNode);
    else range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  private confirmTextEdit(): void {
    const editing = this.editingText;
    if (!editing) return;
    this.teardownTextEdit();
    const next = (editing.el.textContent ?? "").trim();
    const prev = editing.original.trim();
    if (next === prev) return;
    // ¿Las copias compartían texto? La clickeada ya está mutada al nuevo texto,
    // así que comparamos las OTRAS copias contra el texto original. Si todas
    // coincidían → literal compartido (cambia en todas); si no → .map de array
    // (el codemod edita una sola entrada).
    const loc = editing.el.dataset.beonLoc!;
    const copies = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-beon-loc="${CSS.escape(loc)}"]`),
    );
    let domSharedText: boolean | undefined;
    if (copies.length > 1) {
      domSharedText = copies.every(
        (c) => c === editing.el || (c.textContent ?? "").trim() === prev,
      );
    }
    this.pushOp(
      {
        kind: "set_text",
        loc,
        tag: editing.el.tagName.toLowerCase(),
        old_text: prev,
        new_text: next,
        dom_shared_text: domSharedText,
      },
      () => this.restoreEditedText(editing),
      editing.el,
    );
  }
  /** Restaura el texto original sin destruir hijos-elemento (íconos). En el
   *  caso mixto escribe el nodo de texto; en la hoja simple usa textContent. */
  private restoreEditedText(editing: { el: HTMLElement; original: string; textNode: Text | null }): void {
    if (editing.textNode) editing.textNode.nodeValue = editing.original;
    else editing.el.textContent = editing.original;
  }
  private cancelTextEdit(): void {
    const editing = this.editingText;
    if (!editing) return;
    this.restoreEditedText(editing);
    this.teardownTextEdit();
  }
  private teardownTextEdit(): void {
    const editing = this.editingText;
    if (!editing) return;
    editing.el.removeAttribute("contenteditable");
    editing.el.removeAttribute("data-beon-vedit-editing");
    this.editingText = null;
  }
  // ── toolbar de estilos ──────────────────────────────────────────────────
  private classTokens(el: HTMLElement): string[] {
    return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }
  /** Emite un set_classes intercambiando dentro de un grupo cerrado:
   *  remueve todos los tokens del grupo presentes, agrega el elegido. */
  private swapClass(
    el: HTMLElement, group: string[], next: string | null,
    inlineProp: string, inlineValue: string,
  ): void {
    const present = this.classTokens(el).filter((c) => group.includes(c));
    const add = next && !present.includes(next) ? [next] : [];
    const remove = present.filter((c) => c !== next);
    if (add.length === 0 && remove.length === 0) return;
    const prevInline = (el.style as unknown as Record<string, string>)[inlineProp] ?? "";
    (el.style as unknown as Record<string, string>)[inlineProp] = inlineValue;
    for (const c of remove) el.classList.remove(c);
    for (const c of add) el.classList.add(c);
    this.pushOp(
      {
        kind: "set_classes",
        loc: el.dataset.beonLoc!,
        tag: el.tagName.toLowerCase(),
        add,
        remove,
      },
      () => {
        (el.style as unknown as Record<string, string>)[inlineProp] = prevInline;
        for (const c of add) el.classList.remove(c);
        for (const c of remove) el.classList.add(c);
      },
      el,
    );
  }
  private buildToolbar(el: HTMLElement): void {
    this.toolbar?.remove();
    const tb = document.createElement("div");
    tb.className = "beon-vedit-toolbar";
    this.toolbar = tb;
    // Tamaño de texto
    const size = document.createElement("select");
    size.title = "Tamaño";
    const current = this.classTokens(el).find((c) => VEDIT_TEXT_SIZES.includes(c)) ?? "";
    size.innerHTML =
      `<option value="">Aa</option>` +
      VEDIT_TEXT_SIZES.map(
        (s) => `<option value="${s}" ${s === current ? "selected" : ""}>${s.replace("text-", "")}</option>`,
      ).join("");
    size.addEventListener("change", () => {
      if (size.value) this.swapClass(el, VEDIT_TEXT_SIZES, size.value, "fontSize", VEDIT_SIZE_PX[size.value]);
    });
    tb.appendChild(size);
    // Negrita
    this.mkBtn(tb, "B", "Negrita", () => {
      const has = this.classTokens(el).includes("font-bold");
      this.swapClass(el, ["font-bold"], has ? null : "font-bold", "fontWeight", has ? "400" : "700");
    }).style.fontWeight = "800";
    // Alineación (cicla)
    this.mkBtn(tb, "⇤⇥", "Alineación", () => {
      const cur = this.classTokens(el).find((c) => VEDIT_ALIGNS.includes(c));
      const idx = cur ? VEDIT_ALIGNS.indexOf(cur) : -1;
      const next = VEDIT_ALIGNS[(idx + 1) % VEDIT_ALIGNS.length];
      this.swapClass(el, VEDIT_ALIGNS, next, "textAlign", next.replace("text-", ""));
    });
    this.mkSep(tb);
    // Color de texto / fondo (swatches)
    this.mkSwatches(tb, "A", "Color de texto", (name, hex) =>
      this.swapClass(el, VEDIT_COLORS.map(([n]) => `text-${n}`), `text-${name}`, "color", hex),
    );
    this.mkSwatches(tb, "▢", "Color de fondo", (name, hex) =>
      this.swapClass(el, VEDIT_COLORS.map(([n]) => `bg-${n}`), `bg-${name}`, "backgroundColor", hex),
    );
    this.mkSep(tb);
    // Padding / margin steppers
    this.mkStepper(tb, "P", "Espaciado interno", el, VEDIT_PADDINGS, "padding");
    this.mkStepper(tb, "M", "Margen", el, VEDIT_MARGINS, "margin");
    this.mkSep(tb);
    // Ocultar.
    //
    // Hay DOS "ocultar" y no hacen lo mismo, así que nunca se muestran los
    // dos juntos:
    //
    // - Sobre un ítem de navegación de un sistema base: "Ocultar módulo".
    //   Se lo pide a la plataforma, que saca el ítem del menú Y protege la
    //   ruta y las APIs del módulo. Es reversible y no toca los datos.
    // - Sobre cualquier otro elemento: el ojo de siempre, que agrega la clase
    //   `hidden`. Sobre un ítem de nav ESO NO ALCANZA —la ruta y la API
    //   seguirían vivas para quien sepa la URL—, y por eso ahí se reemplaza.
    const slugModulo = this.moduloDe(el);
    if (slugModulo) {
      // El asistente es un módulo de PLATAFORMA y se nombra por lo que es: el
      // dueño no sabe qué es "un módulo", y "Ocultar asistente" le dice qué
      // desaparece. El parent bifurca por el slug (SPEC_ASISTENTE_DEL_SISTEMA
      // Bloque 4.5): el asistente se apaga con un interruptor de la
      // plataforma, el resto con `modulosOcultos` del repo.
      const etiqueta =
        slugModulo === "asistente" ? "Ocultar asistente" : "Ocultar módulo";
      this.mkBtn(tb, etiqueta, "Sacarlo del menú (reversible)", () => {
        this.emit("vedit:hide_module", { slug: slugModulo });
        this.clearSelection();
      });
    } else {
      this.mkBtn(tb, "👁", "Ocultar", () => {
        this.swapClass(el, ["hidden"], "hidden", "display", "none");
        this.clearSelection();
      });
    }
    // Eliminar (confirm liviano inline)
    const del = this.mkBtn(tb, "🗑", "Eliminar", () => {
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = "¿Eliminar?";
        setTimeout(() => {
          del.dataset.confirm = "0";
          del.textContent = "🗑";
        }, 2500);
        return;
      }
      const prevDisplay = el.style.display;
      el.style.display = "none";
      this.pushOp(
        {
          kind: "delete_element",
          loc: el.dataset.beonLoc!,
          tag: el.tagName.toLowerCase(),
        },
        () => {
          el.style.display = prevDisplay;
        },
        el,
      );
      this.clearSelection();
    });
    // Montar invisible → medir → posicionar. Sin la medición real no se
    // puede garantizar que la toolbar no tape la selección.
    tb.style.visibility = "hidden";
    document.body.appendChild(tb);
    this.positionToolbar();
  }
  /** Posicionamiento estilo Figma: la toolbar NUNCA cubre el elemento
   *  seleccionado. Prueba en orden 4 cuadrantes (arriba, abajo, derecha,
   *  izquierda) y se queda con el primero donde entra completa. Último
   *  recurso (elemento ocupa todo el viewport): pegada al borde superior.
   *  Siempre clampeada al viewport. */
  private positionToolbar(): void {
    const tb = this.toolbar;
    const el = this.selected;
    if (!tb || !el) return;
    const r = el.getBoundingClientRect();
    const tw = tb.offsetWidth;
    const th = tb.offsetHeight;
    const gap = 8;
    // La box-shadow de la toolbar (0 8px 24px) extiende ~20px hacia abajo
    // fuera del bounding box. Sin esto la sombra cae sobre el elemento.
    const shadow = 20;
    // Altura de la etiqueta <tag> que cuelga 22px arriba del selBox.
    const tagH = 22;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const notesBottom = Math.max(
      r.bottom,
      this.repeatNote?.getBoundingClientRect().bottom ?? 0,
      this.dynamicNote?.getBoundingClientRect().bottom ?? 0,
    );
    const clampLeft = (x: number): number =>
      Math.min(Math.max(8, x), Math.max(8, vw - tw - 8));
    const clampTop = (y: number): number =>
      Math.min(Math.max(8, y), Math.max(8, vh - th - 8));
    let top: number;
    let left: number;
    if (r.top - tagH - gap - shadow - th >= 8) {
      // 1) Arriba del elemento (con la etiqueta del tag y aire para la sombra).
      top = r.top - tagH - gap - shadow - th;
      left = clampLeft(r.left);
    } else if (notesBottom + gap + th + 8 <= vh) {
      // 2) Abajo de los notes (la sombra cae fuera del elemento, no compensa).
      top = notesBottom + gap;
      left = clampLeft(r.left);
    } else if (r.right + gap + tw + 8 <= vw) {
      // 3) A la derecha del elemento (caso típico: elemento alto como un
      // sidebar que no deja aire arriba ni abajo).
      top = clampTop(r.top);
      left = r.right + gap;
    } else if (r.left - gap - tw >= 8) {
      // 4) A la izquierda del elemento.
      top = clampTop(r.top);
      left = r.left - gap - tw;
    } else {
      // Último recurso: borde superior del viewport.
      top = 8;
      left = clampLeft(r.left);
    }
    tb.style.left = `${left}px`;
    tb.style.top = `${clampTop(top)}px`;
    tb.style.visibility = "visible";
  }
  /** El slug del módulo al que pertenece este elemento, si es uno ocultable.
   *  Sube por los ancestros porque el click cae en el ícono o el texto de
   *  adentro del `<a data-beon-modulo>`, no en el link. */
  private moduloDe(el: HTMLElement): string | null {
    if (this.modulosOcultables.length === 0) return null;
    const nodo = el.closest<HTMLElement>("[data-beon-modulo]");
    const slug = nodo?.getAttribute("data-beon-modulo") ?? "";
    return this.modulosOcultables.includes(slug) ? slug : null;
  }
  private mkBtn(
    parent: HTMLElement, label: string, title: string, onClick: () => void,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    parent.appendChild(b);
    return b;
  }
  private mkSep(parent: HTMLElement): void {
    const s = document.createElement("div");
    s.className = "sep";
    parent.appendChild(s);
  }
  private mkSwatches(
    parent: HTMLElement, label: string, title: string,
    onPick: (name: string, hex: string) => void,
  ): void {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    const btn = this.mkBtn(wrap, label, title, () => {
      panel.classList.toggle("open");
    });
    btn.style.textDecoration = "underline";
    const panel = document.createElement("div");
    panel.className = "beon-vedit-swatches";
    for (const [name, hex] of VEDIT_COLORS) {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.title = name;
      sw.style.background = hex;
      sw.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        panel.classList.remove("open");
        onPick(name, hex);
      });
      panel.appendChild(sw);
    }
    wrap.appendChild(panel);
    parent.appendChild(wrap);
  }
  private mkStepper(
    parent: HTMLElement, label: string, title: string,
    el: HTMLElement, ladder: string[], inlineProp: string,
  ): void {
    const LADDER_PX = ["0px", "4px", "8px", "12px", "16px", "24px", "32px", "40px", "48px"];
    const step = (dir: 1 | -1) => {
      const cur = this.classTokens(el).find((c) => ladder.includes(c));
      const idx = cur ? ladder.indexOf(cur) : 0;
      const nextIdx = Math.min(ladder.length - 1, Math.max(0, idx + dir));
      if (nextIdx === idx && cur) return;
      this.swapClass(el, ladder, ladder[nextIdx], inlineProp, LADDER_PX[nextIdx]);
    };
    this.mkBtn(parent, `${label}−`, `${title} −`, () => step(-1));
    this.mkBtn(parent, `${label}+`, `${title} +`, () => step(1));
  }
  // ── op stack ────────────────────────────────────────────────────────────
  private pushOp(
    op: Omit<VeditOp, "id" | "dom_count">, revert: () => void, el: HTMLElement,
  ): void {
    const loc = op.loc;
    const domCount = document.querySelectorAll(`[data-beon-loc="${CSS.escape(loc)}"]`).length;
    const full: VeditOp = { ...op, id: `op-${++this.opSeq}-${Date.now()}`, dom_count: domCount };
    this.stack.push({ op: full, revert });
    this.emit("vedit:op", full);
    this.emitStatus();
  }
  private undoLast(): void {
    const entry = this.stack.pop();
    if (!entry) return;
    entry.revert();
    this.emit("vedit:undo", { opId: entry.op.id });
    this.emitStatus();
    if (this.selected) this.refreshSelection();
  }
}
const veditEditor = new VeditEditor();
window.addEventListener("message", (e: MessageEvent) => veditEditor.handleMessage(e));
// ── PWA: registro del service worker ──────────────────────────────────────
//
// Registra el SW que sirve `app/sw.js/route.ts` para que la app sea
// instalable en el teléfono (icono en la pantalla de inicio, pantalla
// completa, pantalla digna sin conexión).
//
// Doble guarda, y las dos son necesarias:
//
//   1. Solo en el ORIGEN CANÓNICO del proyecto. Una PWA queda clavada al
//      origen donde se instaló: si se instalara desde una URL de preview,
//      el icono en el teléfono del cliente apuntaría a un deploy efímero.
//      Además el `site_url` de Supabase se repatchea al dominio canónico,
//      así que una app instalada en el origen viejo queda fuera del
//      allowlist y sus redirects de auth revientan.
//   2. Solo FUERA de un iframe. El preview del sandbox corre en un iframe y
//      un service worker ahí interferiría con HMR, con el bridge de
//      postMessage de arriba y con el latido de liveness.
//
// Sin `NEXT_PUBLIC_CANONICAL_ORIGIN` el registro no ocurre nunca — que es el
// comportamiento correcto en el sandbox y en previews.
const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_CANONICAL_ORIGIN ?? "";
// Sin `export`: Next valida los exports conocidos de instrumentation-client
// (onRouterTransitionStart y compañía) y un export ajeno puede warnear en el
// build de cada app generada. El Bloque 5 la usa desde este mismo archivo.
function isCanonicalOrigin(): boolean {
  if (!CANONICAL_ORIGIN) return false;
  if (window.top !== window.self) return false;
  return window.location.origin === CANONICAL_ORIGIN.replace(/\/+$/, "");
}
// `beforeinstallprompt` se dispara UNA sola vez y temprano. Hay que
// capturarlo en el top-level del módulo, antes de cualquier await: si se
// registra el listener más tarde, el evento ya pasó y el botón de instalar
// nativo no se puede ofrecer nunca más en esa carga.
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
// Se pone en true cuando pasó la ventana de espera inicial. Si el evento
// nativo llega DESPUÉS de eso (red lenta, el SW tardó en activarse), hay que
// ofrecer la instalación en ese momento: si solo dependiéramos del timeout, un
// Android con el evento tardío no vería nunca el botón.
let installWindowOpen = false;
window.addEventListener("beforeinstallprompt", (e: Event) => {
  e.preventDefault();
  deferredInstallPrompt = e as BeforeInstallPromptEvent;
  if (installWindowOpen) startInstallFlow();
});
if (isCanonicalOrigin() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // no-op intencional: sin SW la app funciona igual, solo no es instalable
    });
  });
}
// ── PWA: banda "Instalá tu app" ────────────────────────────────────────────
//
// Que la app SEA instalable no sirve si nadie se entera. En Android/Chrome el
// browser expone `beforeinstallprompt` y se puede instalar de una; en iOS no
// existe instalación programática (Compartir → "Agregar a inicio") y hay que
// contarlo.
//
// Por qué DOM plano y no un componente React montado en app/layout.tsx:
// una línea dentro de layout.tsx la puede borrar el agente en cualquier
// iteración al reescribir fonts o providers, y el injector solo puede
// restaurar archivos completos, no una línea dentro de un archivo que es
// legítimamente del agente. Acá el archivo entero es canónico y se restaura
// por hash, así que además llega a las apps YA publicadas en su próxima
// iteración. Como efecto secundario tampoco depende de la paleta del
// proyecto: si el agente cambia el @theme de globals.css, esto sigue igual.
//
// Decisiones de producto (2026-09-02): SOLO celular; formato banda inferior
// con el color de marca de la app, sin botón flotante; la X la cierra para
// siempre; aparece ~10 s después de la primera interacción o scroll, nunca
// en el primer paint; y es una capa fija que NO empuja el layout de la app.
type InstallBranch =
  | "installable" // Android/Chrome: llegó el evento nativo, se instala de una
  | "ios-safari" // iOS: instructivo manual, no hay API
  | "in-app-browser" // WhatsApp/Instagram/etc: no puede instalar nada
  | "waiting-event" // Android sin evento todavía: se espera a que llegue
  | "installed" // ya está instalada
  | "hidden"; // no mostrar nada (escritorio)
const DISMISSED_KEY = "beon:pwa-install-dismissed";
// Clave del cartel anterior (2026-07 a 2026-09). Quien ya lo cerró una vez
// dijo que no; no se le vuelve a preguntar con otro formato.
const LEGACY_SEEN_KEY = "beon:pwa-install-seen";
const SHOW_AFTER_MS = 10_000;
// Celular de verdad: pantalla angosta Y dedo. Sin el `pointer: coarse` una
// ventana de escritorio angosta vería "Instalá X en tu celular".
const MOBILE_QUERY = "(max-width: 767px) and (pointer: coarse)";
const APP_THEME_COLOR = process.env.NEXT_PUBLIC_APP_THEME_COLOR || "#0074E8";
const APP_LOGO_URL = process.env.NEXT_PUBLIC_APP_LOGO_URL || "";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "";
/** El idioma sale del teléfono, no de la app: la plataforma no le inyecta el
 *  idioma del brief a la app generada y el que la abre en portugués casi
 *  seguro tiene el celular en portugués. */
function isPortuguese(): boolean {
  return (navigator.language || "").toLowerCase().startsWith("pt");
}
const COPY = isPortuguese()
  ? {
      install: (name: string) =>
        name ? `Instale ${name} no seu celular` : "Instale este sistema no seu celular",
      installBtn: "Instalar",
      close: "Fechar",
      iosTitle: (name: string) =>
        name ? `Instale ${name} no seu iPhone` : "Instale este sistema no seu iPhone",
      iosStep1: "Toque em <strong>Compartilhar</strong> (o quadrado com a seta) na barra do Safari.",
      iosStep2: "Escolha <strong>Adicionar à Tela de Início</strong> e confirme.",
      done: "Pronto",
      inApp: "Abra no Safari ou no Chrome para instalar",
      copyLink: "Copiar link",
      copied: "Link copiado!",
    }
  : {
      install: (name: string) =>
        name ? `Instalá ${name} en tu celular` : "Instalá este sistema en tu celular",
      installBtn: "Instalar",
      close: "Cerrar",
      iosTitle: (name: string) =>
        name ? `Instalá ${name} en tu iPhone` : "Instalá este sistema en tu iPhone",
      iosStep1: "Tocá <strong>Compartir</strong> (el cuadrado con la flecha) en la barra de Safari.",
      iosStep2: "Elegí <strong>Agregar a inicio</strong> y confirmá.",
      done: "Listo",
      inApp: "Abrilo en Safari o Chrome para instalarlo",
      copyLink: "Copiar link",
      copied: "¡Link copiado!",
    };
/** Texto blanco o negro según la luminancia relativa (WCAG) del color de
 *  marca. Sin librerías: es un par de líneas y el archivo viaja en cada app.
 *  Un color que no sea hex se trata como oscuro (texto blanco), que es el
 *  caso más común de las paletas de marca. */
function isLightColor(color: string): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}
/** Detección de rama: capacidad primero, sistema operativo solo donde el
 *  browser no da ninguna señal utilizable. */
function detectInstallBranch(): InstallBranch {
  const nav = navigator as Navigator & { standalone?: boolean };
  // 1. ¿Ya está instalada? Capacidad, no user-agent. Confiable en ambas
  //    plataformas.
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  // 2. Navegadores in-app: no pueden instalar. Es una lista negra, o sea
  //    incompleta por naturaleza. Cubre los que importan de verdad: el link
  //    del sistema se comparte por WhatsApp. Va ANTES del check de capacidad
  //    porque algunos exponen el evento sin poder cumplirlo.
  if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|GSA\//.test(ua)) {
    return "in-app-browser";
  }
  // 3. ¿Es un teléfono? Chrome de ESCRITORIO también dispara
  //    `beforeinstallprompt`, y sin esta guarda una laptop vería la banda.
  //    `MacIntel` + `maxTouchPoints` es por iPadOS, que se reporta como
  //    Safari de escritorio.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  if (!isIOS && !isAndroid) return "hidden";
  // 4. Capacidad real de instalar (Android/Chrome y derivados).
  if (deferredInstallPrompt) return "installable";
  // 5. iOS: Safari nunca dispara el evento, así que el instructivo manual es
  //    la única vía posible.
  if (isIOS) return "ios-safari";
  // 6. Android sin evento nativo todavía: no se ofrece nada hasta que llegue
  //    (el listener de `beforeinstallprompt` vuelve a llamar acá). Ofrecer
  //    "Instalar" sin poder cumplirlo es peor que no ofrecerlo.
  return "waiting-event";
}
function wasDismissed(): boolean {
  try {
    return (
      window.localStorage.getItem(DISMISSED_KEY) === "1" ||
      window.localStorage.getItem(LEGACY_SEEN_KEY) === "1"
    );
  } catch {
    return false; // localStorage bloqueado: mejor ofrecer que no ofrecer
  }
}
function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // no-op: sin localStorage la banda vuelve en la próxima carga. Molesto
    // pero no roto.
  }
}
/** Métrica por el bridge de postMessage que ya existe. Emitirla ahora cuesta
 *  cero; retrofitearla después, no. */
function reportInstallEvent(
  branch: InstallBranch,
  action: "shown" | "accepted" | "dismissed" | "already_installed",
): void {
  try {
    window.parent?.postMessage(
      { __beon: true, type: "pwa_install", payload: { branch, action } },
      "*",
    );
  } catch {
    // no-op
  }
}
function removeInstallUI(): void {
  document
    .querySelectorAll("[data-beon-pwa-install],[data-beon-pwa-sheet]")
    .forEach((el) => el.remove());
}
function dismissForever(branch: InstallBranch): void {
  rememberDismissed();
  removeInstallUI();
  reportInstallEvent(branch, "dismissed");
}
const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif";
function svgIcon(paths: string, size: number): string {
  return (
    `<svg width='${size}' height='${size}' viewBox='0 0 24 24' fill='none' ` +
    "stroke='currentColor' stroke-width='2' stroke-linecap='round' " +
    `stroke-linejoin='round' aria-hidden='true'>${paths}</svg>`
  );
}
/** El icono de la app si hay logo; si no, un teléfono con la flecha. */
function buildBandIcon(fg: string): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = [
    "flex:0 0 auto",
    "width:38px",
    "height:38px",
    "border-radius:10px",
    "overflow:hidden",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    `background:${fg === "#fff" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.08)"}`,
  ].join(";");
  if (APP_LOGO_URL) {
    const img = document.createElement("img");
    img.src = APP_LOGO_URL;
    img.alt = "";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;background:#fff";
    // Si el logo no carga, queda el glifo genérico en vez de un cuadrado roto.
    img.addEventListener("error", () => {
      box.innerHTML = svgIcon(
        "<rect x='6' y='2' width='12' height='20' rx='2'/><path d='M12 7v7'/><path d='M9.5 11.5 12 14l2.5-2.5'/>",
        20,
      );
    });
    box.appendChild(img);
  } else {
    box.innerHTML = svgIcon(
      "<rect x='6' y='2' width='12' height='20' rx='2'/><path d='M12 7v7'/><path d='M9.5 11.5 12 14l2.5-2.5'/>",
      20,
    );
  }
  return box;
}
function buildBand(branch: InstallBranch): HTMLElement {
  const light = isLightColor(APP_THEME_COLOR);
  const fg = light ? "#150422" : "#fff";
  const host = document.createElement("div");
  host.setAttribute("data-beon-pwa-install", "");
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", COPY.install(APP_NAME));
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:2147483000",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "padding:10px 10px 10px 12px",
    "padding-bottom:calc(10px + env(safe-area-inset-bottom))",
    `background:${APP_THEME_COLOR}`,
    `color:${fg}`,
    "border-radius:16px 16px 0 0",
    "box-shadow:0 -6px 24px rgba(0,0,0,.18)",
    `font-family:${FONT_STACK}`,
    "transform:translateY(110%)",
    "transition:transform .35s cubic-bezier(.2,.8,.2,1)",
    "box-sizing:border-box",
  ].join(";");
  host.appendChild(buildBandIcon(fg));
  const text = document.createElement("div");
  text.style.cssText =
    "flex:1 1 auto;min-width:0;font-size:14px;font-weight:600;line-height:1.25";
  text.textContent =
    branch === "in-app-browser" ? COPY.inApp : COPY.install(APP_NAME);
  host.appendChild(text);
  const primary = document.createElement("button");
  primary.type = "button";
  primary.style.cssText = [
    "flex:0 0 auto",
    "border:0",
    "border-radius:999px",
    `background:${fg}`,
    `color:${APP_THEME_COLOR}`,
    "font-size:13px",
    "font-weight:700",
    "padding:9px 14px",
    "cursor:pointer",
    "white-space:nowrap",
    `font-family:${FONT_STACK}`,
  ].join(";");
  primary.textContent =
    branch === "in-app-browser" ? COPY.copyLink : COPY.installBtn;
  host.appendChild(primary);
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", COPY.close);
  close.style.cssText = [
    "flex:0 0 auto",
    "border:0",
    "background:transparent",
    `color:${fg}`,
    "opacity:.85",
    "padding:8px",
    "margin-left:-2px",
    "cursor:pointer",
    "display:flex",
    "line-height:1",
  ].join(";");
  close.innerHTML = svgIcon("<path d='M18 6 6 18'/><path d='m6 6 12 12'/>", 18);
  close.addEventListener("click", () => dismissForever(branch));
  host.appendChild(close);
  if (branch === "installable") {
    primary.addEventListener("click", async () => {
      const evt = deferredInstallPrompt;
      if (!evt) return;
      deferredInstallPrompt = null;
      // La banda se va antes de abrir el diálogo nativo. Instale o cancele,
      // no se vuelve a preguntar: el que cancela el prompt del sistema ya
      // contestó.
      removeInstallUI();
      try {
        await evt.prompt();
        const choice = await evt.userChoice;
        reportInstallEvent(
          branch, choice.outcome === "accepted" ? "accepted" : "dismissed",
        );
      } catch {
        // el browser cerró el diálogo por su cuenta
      }
      rememberDismissed();
    });
  } else if (branch === "ios-safari") {
    primary.addEventListener("click", () => openIosSheet());
  } else {
    // in-app-browser
    primary.addEventListener("click", async () => {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        primary.textContent = COPY.copied;
      } catch {
        // Sin permisos de clipboard: mostrar la URL seleccionable a mano.
        text.textContent = url;
        text.style.fontWeight = "400";
      }
    });
  }
  return host;
}
/** Instructivo de dos pasos para iPhone, en una hoja simple encima de la
 *  banda. Cerrarla no descarta la banda: la X de la banda es lo único que la
 *  mata para siempre. */
function openIosSheet(): void {
  if (document.querySelector("[data-beon-pwa-sheet]")) return;
  const backdrop = document.createElement("div");
  backdrop.setAttribute("data-beon-pwa-sheet", "");
  backdrop.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483001",
    "background:rgba(0,0,0,.45)",
    "display:flex",
    "align-items:flex-end",
    `font-family:${FONT_STACK}`,
  ].join(";");
  const sheet = document.createElement("div");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.style.cssText = [
    "width:100%",
    "background:#fff",
    "color:#18181b",
    "border-radius:16px 16px 0 0",
    "padding:20px 20px",
    "padding-bottom:calc(20px + env(safe-area-inset-bottom))",
    "box-sizing:border-box",
    "display:flex",
    "flex-direction:column",
    "gap:12px",
  ].join(";");
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:16px";
  title.textContent = COPY.iosTitle(APP_NAME);
  sheet.appendChild(title);
  const steps = document.createElement("ol");
  steps.style.cssText =
    "margin:0;padding:0 0 0 22px;font-size:14px;line-height:1.5;color:#3f3f46;display:flex;flex-direction:column;gap:6px";
  const step1 = document.createElement("li");
  step1.innerHTML = COPY.iosStep1;
  const step2 = document.createElement("li");
  step2.innerHTML = COPY.iosStep2;
  steps.appendChild(step1);
  steps.appendChild(step2);
  sheet.appendChild(steps);
  const done = document.createElement("button");
  done.type = "button";
  done.textContent = COPY.done;
  done.style.cssText = [
    "border:0",
    "border-radius:12px",
    `background:${APP_THEME_COLOR}`,
    `color:${isLightColor(APP_THEME_COLOR) ? "#150422" : "#fff"}`,
    "font-size:15px",
    "font-weight:600",
    "padding:12px 16px",
    "cursor:pointer",
    "width:100%",
    `font-family:${FONT_STACK}`,
  ].join(";");
  const closeSheet = () => backdrop.remove();
  done.addEventListener("click", closeSheet);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet();
  });
  sheet.appendChild(done);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
}
function showBand(branch: InstallBranch): void {
  removeInstallUI();
  const band = buildBand(branch);
  document.body.appendChild(band);
  // Dos frames: el primero pinta la banda fuera de pantalla, el segundo la
  // desliza. Sin el doble rAF el browser colapsa los dos estilos y no hay
  // transición.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      band.style.transform = "translateY(0)";
    });
  });
  reportInstallEvent(branch, "shown");
}
function startInstallFlow(): void {
  if (!isCanonicalOrigin()) return;
  if (!window.matchMedia(MOBILE_QUERY).matches) return;
  if (wasDismissed()) return;
  const branch = detectInstallBranch();
  // Ya instalada: se emite la métrica (sirve para medir adopción) y no se
  // muestra nada.
  if (branch === "installed") {
    reportInstallEvent(branch, "already_installed");
    return;
  }
  // `waiting-event`: el listener de `beforeinstallprompt` vuelve a llamar acá
  // cuando el evento llegue, si la ventana ya está abierta.
  if (branch === "hidden" || branch === "waiting-event") return;
  if (document.querySelector("[data-beon-pwa-install]")) return;
  // NO encima de un diálogo abierto de la app: ahí la banda taparía algo que
  // el usuario está usando. El temporizador se vuelve a armar con la próxima
  // interacción (ver abajo).
  const modalAbierto = document.querySelector(
    "[role='dialog'],[aria-modal='true'],dialog[open]",
  );
  if (modalAbierto) return;
  showBand(branch);
}
// La banda aparece ~10 s después de la PRIMERA interacción o scroll, nunca en
// el primer paint: el que acaba de entrar todavía no sabe si le importa la
// app, y el que ya tocó algo la está usando. `beforeinstallprompt` también
// puede llegar después del load, así que esperar juega a favor.
if (isCanonicalOrigin()) {
  const INTERACTION_EVENTS = ["pointerdown", "touchstart", "scroll", "keydown", "wheel"];
  let armed = false;
  const listenForInteraction = () => {
    armed = false;
    INTERACTION_EVENTS.forEach((ev) =>
      window.addEventListener(ev, armInstallTimer, { capture: true, passive: true }),
    );
  };
  const armInstallTimer = () => {
    if (armed) return;
    armed = true;
    INTERACTION_EVENTS.forEach((ev) =>
      window.removeEventListener(ev, armInstallTimer, true),
    );
    window.setTimeout(() => {
      installWindowOpen = true;
      startInstallFlow();
      // Si no se mostró por algo transitorio (un diálogo abierto, el teléfono
      // apaisado en ese instante, el evento nativo que todavía no llegó), la
      // próxima interacción vuelve a intentar. Sin esto, un solo intento
      // fallido dejaba la banda sin aparecer en toda la carga.
      if (!document.querySelector("[data-beon-pwa-install]") && !wasDismissed()) {
        listenForInteraction();
      }
    }, SHOW_AFTER_MS);
  };
  listenForInteraction();
  // Instalada de verdad: no queda nada. Es el único momento en que se puede
  // saber con certeza en Android; en iOS se detecta en la carga siguiente vía
  // display-mode.
  window.addEventListener("appinstalled", () => {
    rememberDismissed();
    removeInstallUI();
  });
}
// ─────────────────────────────────────────────────────────────────────
// Marca de agua del plan free (SPEC_PLAN_FREE_INFRA_COMPARTIDA).
//
// Por qué vive ACÁ y no en `app/layout.tsx`: el layout es el único archivo
// del scaffold que el agente edita legítimamente (fonts, metadata,
// providers), así que un badge montado ahí lo borra el primer cambio de
// tipografía — en silencio, y justo en el gancho de venta del plan pago.
// Este archivo, en cambio, lo restaura el injector en cada commit y Next lo
// auto-carga en TODA página sin una sola línea en el layout. Es el mismo
// razonamiento por el que la PWA vive en `manifest.ts` / `icon.tsx`.
//
// El interruptor es `NEXT_PUBLIC_TS_BADGE`, que inyecta la plataforma al
// proyecto Vercel ANTES de cada build de producción (`sync_badge_env_to_vercel`).
// Se escribe SIEMPRE, en "1" o en "0": si solo se escribiera al prender, el
// badge nunca se iría al contratar un plan y dejaría de ser un gancho de venta.
// Un `NEXT_PUBLIC_*` se inlinea en build time, así que el cambio se ve en la
// publicación siguiente, no en el instante del pago.
//
// En el sandbox del chat la var no existe → no renderiza, que es lo correcto:
// ahí el badge lo pone la plataforma sobre el iframe (`SandboxMadeWithBadge`).
// ─────────────────────────────────────────────────────────────────────
const BADGE_ID = "tusistema-made-with-badge";
function mountMadeWithBadge() {
  // Idempotente: el injector puede correr más de una vez por sesión y este
  // módulo podría evaluarse de nuevo tras un fast refresh.
  if (document.getElementById(BADGE_ID)) return;
  // En portugués la marca es TeuSistema.AI y su dominio es `teusistema.ai`
  // (sirve Brasil, ver `lib/hosts.ts` de la plataforma).
  const lang = (document.documentElement.lang || "").toLowerCase();
  const esPt = lang.startsWith("pt");
  const texto = esPt ? "Feito com TeuSistema.AI" : "Hecho con TuSistema.AI";
  const dominio = esPt ? "https://teusistema.ai" : "https://tusistema.ai";
  const a = document.createElement("a");
  a.id = BADGE_ID;
  a.href = dominio + "/?utm_source=app_badge&utm_medium=badge";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  // El isotipo de la marca (la "S" con el rayito), mismo vector que el lockup
  // de la plataforma (`components/brand/tusistema-logo.tsx`). Inline y sin
  // depender de un asset externo: la app publicada no carga nada nuestro.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("viewBox", "0 3 135.2 131.2");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "flex-shrink:0;display:block";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "#0074E8");
  path.setAttribute(
    "d",
    "M117.831 3.4502C133.241 3.4502 140.946 22.0834 130.058 32.9717L116.521 46.5078C114.622 48.4072 112.374 49.892 109.94 50.8818V50.9355C120.815 45.2375 135.153 52.8216 135.154 66.3447V82.959C135.154 89.8744 132.412 96.5087 127.516 101.404L103.533 125.389C97.607 131.314 89.5678 134.644 81.1811 134.645H17.3246C1.91517 134.645 -5.79006 116.011 5.09807 105.123L18.6352 91.5859C20.2671 89.9541 22.1805 88.6571 24.227 87.6807V87.6406C13.4992 92.4026 0.00242503 84.8714 0.00236772 71.7627V55.1494C0.00236772 48.2339 2.74433 41.5989 7.64006 36.7031L31.6235 12.7061C37.5492 6.78034 45.589 3.4502 53.976 3.4502H117.831ZM82.1928 33.0254C83.9449 28.7317 78.3804 25.0938 74.5414 28.0098L40.7533 53.7725C38.1182 55.7789 38.7197 59.6446 41.8764 60.8887L63.4662 69.3955C64.6299 69.8503 65.1918 71.0679 64.7504 72.1514L51.2397 105.098C49.488 109.391 55.0522 113.029 58.891 110.113L92.6801 84.3506C95.3151 82.3441 94.7128 78.4784 91.5561 77.2344L69.9672 68.7266C68.8035 68.2718 68.2417 67.0551 68.683 65.9717L82.1928 33.0254Z",
  );
  svg.appendChild(path);
  a.appendChild(svg);
  a.appendChild(document.createTextNode(texto));
  // Abajo a la IZQUIERDA a propósito: el launcher de instalación de la PWA
  // ocupa la esquina derecha y dos chips superpuestos se leen como un bug.
  a.style.cssText = [
    "position:fixed",
    "left:12px",
    "bottom:12px",
    // Por debajo de un modal (que suele usar 9999+) y por encima del
    // contenido normal: el badge nunca debe tapar un diálogo del usuario.
    "z-index:2147483000",
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "padding:6px 10px",
    "border-radius:999px",
    "border:1px solid rgba(0,0,0,0.10)",
    "background:rgba(255,255,255,0.94)",
    "color:#150422",
    "font:500 11px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "text-decoration:none",
    "box-shadow:0 1px 3px rgba(0,0,0,0.10)",
    "backdrop-filter:saturate(180%) blur(6px)",
  ].join(";");
  document.body.appendChild(a);
}
// ── Módulos de plataforma: un solo mecanismo para ocultarlos ──────────────
//
// SPEC_ASISTENTE_DEL_SISTEMA Bloque 4.4, generalizado por slug en
// SPEC_WHATSAPP_TWILIO_HORNEADO Bloque 3b. El estado vive en la plataforma, no
// en el código de la app: apagar un módulo NO commitea nada al repo del dueño
// ni dispara al agente. Este runtime lo lee y esconde el ítem del menú, valga
// la app de scaffold libre, de molde o del piso — las tres estampan el mismo
// atributo `data-beon-modulo`.
//
// La página de cada módulo se niega por su cuenta cuando está apagado, así
// que esto es cosmética del menú y no control de acceso.
//
// Unión cerrada: un módulo nuevo entra a la tabla con su ruta de la propia app
// (que responde `{enabled: boolean}`), y nada más. `cacheKey` y `styleId` son
// literales porque persisten entre cargas (sessionStorage, DOM) y tienen que
// seguir siendo los de siempre para el asistente.
type ModuloDePlataforma = "asistente" | "whatsapp";
interface ModuloOcultable {
  readonly slug: ModuloDePlataforma;
  /** Ruta de la PROPIA app que responde `{enabled: boolean}`; 404 = el módulo
   *  no está instalado en esta app. */
  readonly rutaConfig: string;
  readonly cacheKey: string;
  readonly styleId: string;
}
const MODULOS_OCULTABLES: readonly ModuloOcultable[] = [
  {
    slug: "asistente",
    rutaConfig: "/api/beon/asistente/config",
    cacheKey: "beon:asistente:enabled",
    styleId: "beon-asistente-oculto",
  },
  {
    slug: "whatsapp",
    rutaConfig: "/api/beon/whatsapp/visible",
    cacheKey: "beon:whatsapp:enabled",
    styleId: "beon-whatsapp-oculto",
  },
];
const MODULO_CACHE_MS = 5 * 60 * 1000;
async function moduloHabilitado(modulo: ModuloOcultable): Promise<boolean | null> {
  try {
    const crudo = sessionStorage.getItem(modulo.cacheKey);
    if (crudo) {
      const { v, t } = JSON.parse(crudo) as { v: boolean; t: number };
      if (Date.now() - t < MODULO_CACHE_MS) return v;
    }
  } catch {
    // sessionStorage bloqueado (modo privado, cookies off): se pregunta y listo.
  }
  const res = await fetch(modulo.rutaConfig, { cache: "no-store" });
  // 404 = el módulo no está instalado en esta app. No es un error y no hay nada
  // que esconder.
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as { enabled?: boolean };
  const enabled = Boolean(body.enabled);
  try {
    sessionStorage.setItem(
      modulo.cacheKey, JSON.stringify({ v: enabled, t: Date.now() }),
    );
  } catch {
    // Sin caché anda igual: es un fetch más por carga.
  }
  return enabled;
}
function selectorDelModulo(slug: ModuloDePlataforma): string {
  return `[data-beon-modulo="${slug}"]`;
}
/**
 * Esconde el ítem con una REGLA DE CSS, no tocando el atributo del elemento.
 *
 * Poner `el.hidden = true` sobre el `<a>` que React acaba de renderizar en el
 * servidor produce un mismatch de hidratación ("some attributes of the server
 * rendered HTML didn't match the client properties. This won't be patched up"),
 * medido el 2026-09-09 en el molde `turnos-ficha`. Eso no es cosmético: React
 * puede descartar el árbol y re-renderizar del lado del cliente, y ahí el ítem
 * VUELVE A APARECER — o sea que el mecanismo de ocultar se desharía solo.
 *
 * Un `<style>` propio en el `<head>` no está en el árbol de React, así que no
 * hay nada que reconciliar. Y cubre gratis los ítems que se monten después: la
 * nav de escritorio, la barra inferior del celular, y cualquier re-render.
 * Un `<style>` por módulo (id distinto por slug): el del asistente y el de
 * WhatsApp conviven.
 */
function pintarVisibilidadModulo(modulo: ModuloOcultable, enabled: boolean): void {
  const previo = document.getElementById(modulo.styleId);
  if (enabled) {
    previo?.remove();
    return;
  }
  if (previo) return;
  const style = document.createElement("style");
  style.id = modulo.styleId;
  style.textContent = `${selectorDelModulo(modulo.slug)}{display:none !important}`;
  document.head.appendChild(style);
}
async function applyModuleVisibility(modulo: ModuloOcultable): Promise<void> {
  // Sin ítem en el DOM no hay nada que resolver: ni el fetch vale la pena.
  if (!document.querySelector(selectorDelModulo(modulo.slug))) return;
  const enabled = await moduloHabilitado(modulo);
  if (enabled === null) return;
  pintarVisibilidadModulo(modulo, enabled);
}
{
  const arrancarModulos = () => {
    for (const modulo of MODULOS_OCULTABLES) {
      void applyModuleVisibility(modulo).catch((err) => {
        // Nunca tumba la app del dueño: el peor caso es un ítem de menú que
        // sigue visible un rato de más.
        console.warn(`[tusistema] no se pudo resolver el módulo ${modulo.slug}:`, err);
      });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancarModulos, { once: true });
  } else {
    arrancarModulos();
  }
}
if (process.env.NEXT_PUBLIC_TS_BADGE === "1") {
  // Sin fallback silencioso, pero tampoco puede tumbar la app del dueño: el
  // badge es marca nuestra, no una función que él pidió. Si el DOM no está
  // listo todavía, se espera al `DOMContentLoaded`.
  const arrancar = () => {
    try {
      mountMadeWithBadge();
    } catch (err) {
      console.warn("[tusistema] no se pudo montar el badge:", err);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  } else {
    arrancar();
  }
}
