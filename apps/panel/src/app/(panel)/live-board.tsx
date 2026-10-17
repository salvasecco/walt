"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Pin, PinOff, Radio, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountUp } from "@/components/count-up";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Journey } from "@/components/journey";
import { ChangesDiff, GateReasons, OpsList, Phone } from "@/components/request-parts";
import { SiteMock } from "@/components/site-mock";
import { CategoryChip, Chip, EmptyState, IdTag, Surface, Mono, PanelTitle, SampleBadge, StatusChip } from "@/components/ui-dale";
import type { LiveSnapshot } from "@/lib/data";
import { buildJourney, timeToPublish } from "@/lib/journey";
import { OPEN_STATUSES, TZ, clock, ms, relative } from "@/lib/labels";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SEED_PROJECT_ID, type ContentVersion, type DaleEvent, type DaleRequest, type Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  initial: LiveSnapshot;
  supabase: { url: string; anonKey: string } | null;
  sample: boolean;
  siteUrl: string;
};

type Conn = "conectando" | "en_vivo" | "sin_conexion" | "ejemplo";

const dayKey = (iso: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

function upsert<T extends { id: string | number }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [row, ...list];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...row };
  return copy;
}

export function LiveBoard({ initial, supabase, sample, siteUrl }: Props) {
  const [requests, setRequests] = useState<DaleRequest[]>(initial.requests);
  const [events, setEvents] = useState<DaleEvent[]>(initial.events);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [versions, setVersions] = useState<ContentVersion[]>(initial.liveVersions);
  const [conn, setConn] = useState<Conn>(sample ? "ejemplo" : supabase ? "conectando" : "sin_conexion");
  const [pinned, setPinned] = useState<string | null>(null);
  const [siteNonce, setSiteNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // ── Realtime: requests, events, messages y content_versions ──────────────
  useEffect(() => {
    if (!supabase || sample) return;
    const db = supabaseBrowser(supabase.url, supabase.anonKey);
    const ch = db
      .channel("panel-en-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, (p) => {
        if (p.eventType === "DELETE") return;
        setRequests((l) => upsert(l, p.new as DaleRequest));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) => {
        setEvents((l) => (l.some((e) => e.id === (p.new as DaleEvent).id) ? l : [...l, p.new as DaleEvent]));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        setMessages((l) => (l.some((m) => m.id === (p.new as Message).id) ? l : [...l, p.new as Message]));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "content_versions" }, (p) => {
        if (p.eventType === "DELETE") return;
        const v = p.new as ContentVersion;
        setVersions((l) => {
          const others = l.filter((x) => x.id !== v.id && !(v.status === "viva" && x.project_id === v.project_id));
          return v.status === "viva" ? [v, ...others] : others;
        });
        setSiteNonce((n) => n + 1);
      })
      .subscribe((status) => {
        setConn(status === "SUBSCRIBED" ? "en_vivo" : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "sin_conexion" : "conectando");
      });
    return () => {
      void db.removeChannel(ch);
    };
  }, [supabase, sample]);

  // ── Datos de ejemplo: reproduce un pedido para ver el recorrido moverse ──
  useSimulation(sample, initial, setRequests, setEvents, setMessages);

  // ── Pedido activo ────────────────────────────────────────────────────────
  const lastActivity = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) m.set(r.id, new Date(r.updated_at ?? r.created_at).getTime());
    for (const e of events) {
      const t = new Date(e.at).getTime();
      if ((m.get(e.request_id) ?? 0) < t) m.set(e.request_id, t);
    }
    return m;
  }, [requests, events]);

  const ordered = useMemo(
    () => [...requests].sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0)),
    [requests, lastActivity],
  );
  const active = (pinned && requests.find((r) => r.id === pinned)) || ordered[0] || null;
  const project = active ? initial.projects.find((p) => p.id === active.project_id) : undefined;
  const live = versions.find((v) => v.project_id === (active?.project_id ?? initial.projects[0]?.id)) ?? null;
  const nodes = useMemo(() => (active ? buildJourney(active, events) : []), [active, events]);
  const activePublish = active ? timeToPublish(active, events) : null;
  const conversation = useMemo(
    () => (active ? messages.filter((m) => m.request_id === active.id).sort((a, b) => (a.at < b.at ? -1 : 1)) : []),
    [messages, active],
  );

  // ── Indicadores del día ──────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const today = dayKey(now);
    const todays = requests.filter((r) => dayKey(r.created_at) === today);
    const decided = todays.filter((r) => r.category);
    const solo = decided.filter((r) => r.category === "permitido" || r.category === "consulta" || r.category === "charla");
    const times = todays.map((r) => timeToPublish(r, events)).filter((x): x is number => x != null);
    const cost = todays.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
    // Tendencias reales: pedidos y costo por hora en las últimas 24 h (el snapshot trae 36 h).
    const hourly = Array.from({ length: 24 }, () => ({ n: 0, cost: 0 }));
    for (const r of requests) {
      const h = Math.floor((now - new Date(r.created_at).getTime()) / 3_600_000);
      if (h < 0 || h > 23) continue;
      hourly[23 - h].n += 1;
      hourly[23 - h].cost += Number(r.cost_usd ?? 0);
    }
    return {
      count: todays.length,
      open: todays.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      decided: decided.length,
      solo: solo.length,
      autoPct: decided.length ? (solo.length / decided.length) * 100 : 0,
      avgPublish: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      published: times.length,
      publishTrend: times,
      cost,
      costPer: todays.length ? cost / todays.length : 0,
      hasPublish: times.length > 0,
      countTrend: hourly.map((x) => x.n),
      costTrend: hourly.map((x) => x.cost),
    };
  }, [requests, events, now]);

  const effectiveSite = project?.site_url || (active?.project_id === SEED_PROJECT_ID ? siteUrl : "");
  // Con datos de ejemplo los borradores no existen en la base: se muestra el sitio publicado.
  const waitingDraft = !sample && active && active.draft_version_id && (active.status === "esperando_cliente" || active.status === "esperando_agencia");
  const iframeSrc = effectiveSite
    ? waitingDraft
      ? `${effectiveSite}${effectiveSite.includes("?") ? "&" : "?"}preview=${active!.draft_version_id}`
      : effectiveSite
    : null;

  const fmtInt = useCallback((n: number) => String(Math.round(n)), []);
  const fmtPct = useCallback((n: number) => `${Math.round(n)}%`, []);
  const fmtSec = useCallback((n: number) => (n ? `${(n / 1000).toFixed(1)} s` : "—"), []);
  const fmtUsd = useCallback((n: number) => `$${n.toFixed(2)}`, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">En vivo</h1>
          <ConnBadge conn={conn} />
          {sample && <SampleBadge />}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {pinned ? (
            <Button variant="outline" size="lg" onClick={() => setPinned(null)}>
              <PinOff /> Seguir el último pedido
            </Button>
          ) : (
            <span className="flex items-center gap-1.5">
              <Radio className="size-4 text-faint" /> Siguiendo el último pedido
            </span>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Pedidos hoy"
          help="Pedidos que llegaron hoy (hora de Montevideo)."
          value={<CountUp value={kpis.count} format={fmtInt} />}
          context={kpis.open ? `${kpis.open} ${kpis.open === 1 ? "abierto" : "abiertos"} ahora` : "Ninguno abierto ahora"}
          trend={kpis.countTrend}
          trendLabel="Pedidos por hora, últimas 24 h"
        />
        <StatTile
          label="Resuelto sin la agencia"
          help="Pedidos de hoy con categoría permitido, consulta o charla, sobre los que ya tienen categoría."
          value={<CountUp value={kpis.autoPct} format={fmtPct} />}
          context={kpis.decided ? `${kpis.solo} de ${kpis.decided} decididos hoy` : "Sin pedidos decididos hoy"}
        />
        <StatTile
          label="Tiempo medio a publicado"
          help="Desde que llega el pedido hasta el evento publicado."
          value={kpis.hasPublish ? <CountUp value={kpis.avgPublish} format={fmtSec} /> : "—"}
          context={kpis.published ? `${kpis.published} ${kpis.published === 1 ? "publicado" : "publicados"} hoy` : "Nada publicado hoy"}
          trend={kpis.publishTrend}
          trendLabel="Tiempo a publicado de cada pedido de hoy"
        />
        <StatTile
          label="Costo de IA hoy (USD)"
          help="Suma de cost_usd de los pedidos de hoy, en USD."
          value={<CountUp value={kpis.cost} format={fmtUsd} />}
          context={kpis.count ? `≈ $${kpis.costPer.toFixed(3)} por pedido` : "Sin pedidos hoy"}
          trend={kpis.costTrend}
          trendLabel="Costo por hora, últimas 24 h"
        />
      </div>

      {!active ? (
        <EmptyState icon={<Radio className="size-5" />} title="Esperando el primer pedido">
          Cuando un cliente le escriba al asistente por Telegram, el pedido aparece acá al instante.
        </EmptyState>
      ) : (
        <>
          {/* Pedido activo + recorrido */}
          <Surface className="p-5 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <IdTag id={active.short_id} />
                      <CategoryChip category={active.category} />
                      <StatusChip status={active.status} />
                      {active.lane === "codigo" && <Chip tone="code">Carril de código</Chip>}
                      <span className="text-xs text-muted-foreground sm:text-sm">
                        {project?.client_name ?? "Cliente"} · {relative(active.created_at, now)}
                      </span>
                    </div>
                    <p className="mt-3 text-xl leading-snug font-medium text-balance sm:text-2xl">“{active.raw_text}”</p>
                    {active.interpretation?.summary && (
                      <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
                        <span className="mr-2 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">IA</span>
                        {active.interpretation.summary}
                      </p>
                    )}
                  </div>
                  <Link href={`/historial/${active.short_id}`} className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Ver detalle <ExternalLink className="size-3.5" />
                  </Link>
                </div>
                <div className="mt-6">
                  <Journey nodes={nodes} size="lg" />
                </div>
              </motion.div>
            </AnimatePresence>
          </Surface>

          {/* Conversación · decisión · sitio */}
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px] 2xl:grid-cols-[340px_minmax(0,1fr)_420px]">
            <div className="h-[400px] lg:h-[560px]">
              <Phone messages={conversation} assistantName={`Asistente de ${initial.agencyName}`} big />
            </div>

            <Surface className="flex flex-col gap-5 p-5">
              <section>
                <PanelTitle>Lo que va a hacer</PanelTitle>
                <div className="mt-3">
                  {(active.ops ?? active.interpretation?.ops ?? []).length ? (
                    <OpsList request={active} content={live?.content} big />
                  ) : (
                    <p className="text-sm text-muted-foreground sm:text-base">
                      {active.category === "consulta"
                        ? "Contesta con lo que dice la web."
                        : active.category === "fuera_de_alcance"
                          ? "Arma un borrador de presupuesto para la agencia."
                          : active.category === "bloqueado"
                            ? "Nada: el pedido quedó bloqueado."
                            : active.lane === "codigo"
                              ? "Un agente hace el cambio en una rama, con PR y vista previa."
                              : "Interpretando…"}
                    </p>
                  )}
                </div>
              </section>
              {!!active.changes?.length && (
                <section>
                  <PanelTitle>Antes y después</PanelTitle>
                  <div className="mt-3">
                    <ChangesDiff changes={active.changes} content={live?.content} big />
                  </div>
                </section>
              )}
              <section>
                <PanelTitle
                  right={
                    active.confidence != null && (
                      <span className="text-xs text-muted-foreground tnum">Confianza {(Number(active.confidence) * 100).toFixed(0)}%</span>
                    )
                  }
                >
                  Por qué es <CategoryChip category={active.category} className="normal-case tracking-normal" />
                </PanelTitle>
                <div className="mt-3">
                  <GateReasons request={active} />
                  {!active.gate?.reasons?.length && !active.interpretation?.unexpressedParts?.length && (
                    <p className="text-sm text-muted-foreground">{active.category ? "Sin razones extra." : "Todavía decidiendo."}</p>
                  )}
                </div>
              </section>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-faint tnum">
                <span>reglas v{active.rules_version ?? "—"}</span>
                <span>costo ${Number(active.cost_usd ?? 0).toFixed(4)}</span>
                <span>llegó {clock(active.created_at, true)}</span>
                {activePublish != null && <span className="text-ok">publicado en {ms(activePublish)}</span>}
              </div>
            </Surface>

            <Surface className="flex h-[560px] flex-col overflow-hidden lg:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <span className="label-xs">{waitingDraft ? "Vista previa del borrador" : "El sitio, en vivo"}</span>
                <div className="flex items-center gap-2">
                  {iframeSrc && (
                    <>
                      <button onClick={() => setSiteNonce((n) => n + 1)} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Recargar el sitio">
                        <RefreshCw className="size-3.5" />
                      </button>
                      <a href={iframeSrc} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Abrir el sitio">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="relative flex-1 bg-white">
                {iframeSrc ? (
                  <iframe key={`${iframeSrc}-${siteNonce}`} src={iframeSrc} title="Sitio del cliente" className="absolute inset-0 size-full" />
                ) : live?.content ? (
                  <SiteMock content={live.content} highlight={active.changes?.map((c) => c.pointer)} />
                ) : (
                  <div className="grid h-full place-items-center bg-surface-2 p-6 text-center text-sm text-muted-foreground">Sin URL del sitio: configurala en Proyectos o en DEMO_SITE_URL.</div>
                )}
              </div>
            </Surface>
          </div>

          {/* Últimos pedidos */}
          <Surface className="p-4">
            <PanelTitle>Últimos pedidos</PanelTitle>
            <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto pb-1">
              {ordered.slice(0, 14).map((r) => (
                <motion.button
                  layout
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  key={r.id}
                  onClick={() => setPinned(r.id === pinned ? null : r.id)}
                  aria-pressed={r.id === pinned}
                  className={cn(
                    "flex w-60 shrink-0 flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    r.id === active.id ? "border-line-strong bg-white/[0.06]" : "border-line bg-surface-2 hover:bg-white/[0.04]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Mono className="text-[11px] text-muted-foreground">#{r.short_id}</Mono>
                    <span className="flex items-center gap-1.5">
                      {r.id === pinned && <Pin className="size-3 text-muted-foreground" />}
                      {OPEN_STATUSES.includes(r.status) && <span className="size-1.5 animate-pulse rounded-full bg-info" title="Abierto" />}
                      <CategoryChip category={r.category} />
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm">{r.raw_text}</span>
                </motion.button>
              ))}
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}

function ConnBadge({ conn }: { conn: Conn }) {
  const map = {
    en_vivo: { t: "Realtime conectado", dot: "bg-ok", ping: true },
    conectando: { t: "Conectando…", dot: "bg-faint", ping: true },
    sin_conexion: { t: "Sin realtime", dot: "bg-danger", ping: false },
    ejemplo: { t: "Simulación", dot: "bg-warn", ping: true },
  }[conn];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span className="relative flex size-1.5">
        {map.ping && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-50 [animation-duration:2s]", map.dot)} />}
        <span className={cn("relative inline-flex size-1.5 rounded-full", map.dot)} />
      </span>
      {map.t}
    </span>
  );
}

/** Solo con datos de ejemplo: reproduce pedidos de la demo paso a paso, como si llegaran los eventos. */
function useSimulation(
  enabled: boolean,
  initial: LiveSnapshot,
  setRequests: React.Dispatch<React.SetStateAction<DaleRequest[]>>,
  setEvents: React.Dispatch<React.SetStateAction<DaleEvent[]>>,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
) {
  const round = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const scripts = initial.requests.filter((r) => ["permitido", "riesgoso", "consulta", "fuera_de_alcance"].includes(r.category ?? "") && r.lane !== "codigo");
    if (!scripts.length) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    const at = (delay: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), delay));

    const play = () => {
      const base = scripts[round.current++ % scripts.length];
      const id = `sim-${round.current}-${base.id}`;
      const short = `S${String(round.current).padStart(3, "0")}`;
      const start = Date.now();
      const script = initial.events.filter((e) => e.request_id === base.id && e.status !== "inicio");
      const msgs = initial.messages.filter((m) => m.request_id === base.id);
      const finalStatus = base.status;
      setRequests((l) => [
        { ...base, id, short_id: short, status: "recibido", category: null, interpretation: null, ops: null, changes: null, gate: null, cost_usd: 0, created_at: new Date(start).toISOString(), updated_at: new Date(start).toISOString() },
        ...l.filter((r) => !r.id.startsWith("sim-")),
      ]);
      setMessages((l) => [...l, { ...msgs[0], id: `${id}-m0`, request_id: id, at: new Date(start).toISOString() }]);
      let t = 600;
      let evId = 1_000_000 * round.current;
      script.forEach((e, i) => {
        const dur = Math.min(1500, Math.max(450, (e.duration_ms ?? 500) / 3));
        at(t, () => setEvents((l) => [...l, { ...e, id: evId++, request_id: id, status: "inicio", duration_ms: null, at: new Date().toISOString() }]));
        t += dur;
        at(t, () => {
          setEvents((l) => [...l, { ...e, id: evId++, request_id: id, at: new Date().toISOString() }]);
          if (e.step === "interpretado")
            setRequests((l) => l.map((r) => (r.id === id ? { ...r, status: "interpretando", interpretation: base.interpretation, confidence: base.confidence } : r)));
          if (e.step === "decidido" || (i === 1 && !base.interpretation))
            setRequests((l) => l.map((r) => (r.id === id ? { ...r, category: base.category, lane: base.lane, ops: base.ops, changes: base.changes, gate: base.gate, cost_usd: base.cost_usd } : r)));
          if (e.step === "enviado")
            setRequests((l) => l.map((r) => (r.id === id ? { ...r, status: finalStatus === "publicado" || finalStatus === "revertido" ? "esperando_cliente" : finalStatus } : r)));
          if (e.step === "publicado") setRequests((l) => l.map((r) => (r.id === id ? { ...r, status: "publicado", updated_at: new Date().toISOString() } : r)));
        });
        msgs.forEach((reply, k) => {
          if (k === 0 || Math.round((k / Math.max(1, msgs.length - 1)) * (script.length - 1)) !== i) return;
          at(t + 150, () => setMessages((l) => [...l, { ...reply, id: `${id}-m${k}`, request_id: id, at: new Date().toISOString() }]));
        });
        t += 120;
      });
      at(t + 7000, play);
    };
    at(1200, play);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers = [];
    };
  }, [enabled, initial, setRequests, setEvents, setMessages]);
}
