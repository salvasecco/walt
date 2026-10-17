"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Brain, Clock3, DollarSign, ExternalLink, Gauge, Inbox, Pin, PinOff, Radio, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountUp } from "@/components/count-up";
import { Journey } from "@/components/journey";
import { ChangesDiff, GateReasons, OpsList, Phone } from "@/components/request-parts";
import { SiteMock } from "@/components/site-mock";
import { CategoryChip, Chip, EmptyState, Glass, Mono, PanelTitle, SampleBadge, StatusChip } from "@/components/ui-dale";
import type { LiveSnapshot } from "@/lib/data";
import { buildJourney, timeToPublish } from "@/lib/journey";
import { CATEGORY_TONE, OPEN_STATUSES, TZ, clock, ms, relative, toneText } from "@/lib/labels";
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
    return {
      count: todays.length,
      autoPct: decided.length ? (solo.length / decided.length) * 100 : 0,
      avgPublish: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      cost: todays.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0),
      hasPublish: times.length > 0,
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">En vivo</h1>
          <ConnBadge conn={conn} />
          {sample && <SampleBadge />}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {pinned ? (
            <button onClick={() => setPinned(null)} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 hover:text-foreground">
              <PinOff className="size-4" /> Seguir el último pedido
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <Radio className="size-4 text-cyan-neon" /> Siguiendo el último pedido
            </span>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={<Inbox className="size-4" />} label="Pedidos hoy" tone="cyan">
          <CountUp value={kpis.count} format={fmtInt} />
        </Kpi>
        <Kpi icon={<Gauge className="size-4" />} label="Resuelto sin la agencia" tone="emerald">
          <CountUp value={kpis.autoPct} format={fmtPct} />
        </Kpi>
        <Kpi icon={<Clock3 className="size-4" />} label="Tiempo medio a publicado" tone="violet">
          {kpis.hasPublish ? <CountUp value={kpis.avgPublish} format={fmtSec} /> : "—"}
        </Kpi>
        <Kpi icon={<DollarSign className="size-4" />} label="Costo de IA hoy (USD)" tone="amber">
          <CountUp value={kpis.cost} format={fmtUsd} />
        </Kpi>
      </div>

      {!active ? (
        <EmptyState icon={<Radio className="size-5" />} title="Esperando el primer pedido">
          Cuando un cliente le escriba al asistente por Telegram, el pedido aparece acá al instante.
        </EmptyState>
      ) : (
        <>
          {/* Pedido activo + recorrido */}
          <Glass hi className="p-5 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div key={active.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mono className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-sm text-cyan-neon">#{active.short_id}</Mono>
                      <CategoryChip category={active.category} />
                      <StatusChip status={active.status} />
                      {active.lane === "codigo" && <Chip tone="violet">Carril de código</Chip>}
                      <span className="text-sm text-muted-foreground">
                        {project?.client_name ?? "Cliente"} · {relative(active.created_at, now)}
                      </span>
                    </div>
                    <p className="mt-3 text-xl leading-snug font-medium text-balance sm:text-2xl lg:text-[28px]">“{active.raw_text}”</p>
                    {active.interpretation?.summary && (
                      <p className="mt-2 flex items-center gap-2 text-base text-violet-neon sm:text-lg">
                        <Sparkles className="size-4 shrink-0" />
                        {active.interpretation.summary}
                      </p>
                    )}
                  </div>
                  <Link href={`/historial/${active.short_id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    Ver detalle <ExternalLink className="size-3.5" />
                  </Link>
                </div>
                <div className="mt-6">
                  <Journey nodes={nodes} size="lg" />
                </div>
              </motion.div>
            </AnimatePresence>
          </Glass>

          {/* Conversación · decisión · sitio */}
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px] 2xl:grid-cols-[340px_minmax(0,1fr)_420px]">
            <div className="h-[400px] lg:h-[560px]">
              <Phone messages={conversation} assistantName={`Asistente de ${initial.agencyName}`} big />
            </div>

            <Glass className="flex flex-col gap-5 p-5">
              <section>
                <PanelTitle icon={<Brain className="size-3.5 text-violet-neon" />}>Lo que va a hacer</PanelTitle>
                <div className="mt-3">
                  {(active.ops ?? active.interpretation?.ops ?? []).length ? (
                    <OpsList request={active} content={live?.content} big />
                  ) : (
                    <p className="text-base text-muted-foreground">
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
                      <Mono className="text-xs text-muted-foreground">confianza {(Number(active.confidence) * 100).toFixed(0)}%</Mono>
                    )
                  }
                >
                  Por qué es <span className={cn("ml-1", active.category ? toneText[CATEGORY_TONE[active.category]] : "")}>{active.category?.replaceAll("_", " ") ?? "…"}</span>
                </PanelTitle>
                <div className="mt-3">
                  <GateReasons request={active} />
                  {!active.gate?.reasons?.length && !active.interpretation?.unexpressedParts?.length && (
                    <p className="text-sm text-muted-foreground">{active.category ? "Sin razones extra." : "Todavía decidiendo."}</p>
                  )}
                </div>
              </section>
              <div className="mt-auto flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.06] pt-3 font-mono text-xs text-muted-foreground tnum">
                <span>reglas v{active.rules_version ?? "—"}</span>
                <span>costo ${Number(active.cost_usd ?? 0).toFixed(4)}</span>
                <span>llegó {clock(active.created_at, true)}</span>
                {timeToPublish(active, events) != null && <span className="text-emerald-neon">publicado en {ms(timeToPublish(active, events))}</span>}
              </div>
            </Glass>

            <Glass className="flex h-[560px] flex-col overflow-hidden lg:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
                <span className="label-xs">{waitingDraft ? "Vista previa del borrador" : "El sitio, en vivo"}</span>
                <div className="flex items-center gap-2">
                  {iframeSrc && (
                    <>
                      <button onClick={() => setSiteNonce((n) => n + 1)} className="text-muted-foreground hover:text-foreground" aria-label="Recargar el sitio">
                        <RefreshCw className="size-3.5" />
                      </button>
                      <a href={iframeSrc} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Abrir el sitio">
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
                  <div className="grid h-full place-items-center bg-[#0A0D15] p-6 text-center text-sm text-muted-foreground">Sin URL del sitio: configurala en Proyectos o en DEMO_SITE_URL.</div>
                )}
              </div>
            </Glass>
          </div>

          {/* Últimos pedidos */}
          <Glass className="p-4">
            <PanelTitle>Últimos pedidos</PanelTitle>
            <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto pb-1">
              {ordered.slice(0, 14).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setPinned(r.id === pinned ? null : r.id)}
                  className={cn(
                    "flex w-64 shrink-0 flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    r.id === active.id ? "border-cyan-neon/50 bg-cyan-neon/[0.07]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Mono className="text-xs text-muted-foreground">#{r.short_id}</Mono>
                    <span className="flex items-center gap-1.5">
                      {r.id === pinned && <Pin className="size-3 text-cyan-neon" />}
                      {OPEN_STATUSES.includes(r.status) && <span className="size-1.5 animate-pulse rounded-full bg-cyan-neon" />}
                      <CategoryChip category={r.category} className="px-2 py-0 text-[10px]" />
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm">{r.raw_text}</span>
                </button>
              ))}
            </div>
          </Glass>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, tone, children }: { icon: React.ReactNode; label: string; tone: "cyan" | "emerald" | "violet" | "amber"; children: React.ReactNode }) {
  return (
    <Glass className="relative overflow-hidden p-4 sm:p-5">
      <div className={cn("absolute -top-10 -right-10 size-28 rounded-full opacity-25 blur-2xl", { cyan: "bg-cyan-neon", emerald: "bg-emerald-neon", violet: "bg-violet-neon", amber: "bg-amber-neon" }[tone])} />
      <div className={cn("flex items-center gap-2 text-xs font-medium tracking-wide uppercase sm:text-[13px]", toneText[tone])}>
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-3xl font-semibold tracking-tight tnum sm:text-4xl xl:text-5xl">{children}</div>
    </Glass>
  );
}

function ConnBadge({ conn }: { conn: Conn }) {
  const map = {
    en_vivo: { t: "Realtime conectado", c: "border-emerald-neon/40 text-emerald-neon", dot: "bg-emerald-neon" },
    conectando: { t: "Conectando…", c: "border-cyan-neon/40 text-cyan-neon", dot: "bg-cyan-neon" },
    sin_conexion: { t: "Sin realtime", c: "border-rose-neon/40 text-rose-neon", dot: "bg-rose-neon" },
    ejemplo: { t: "Simulación", c: "border-amber-neon/40 text-amber-neon", dot: "bg-amber-neon" },
  }[conn];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs", map.c)}>
      <span className="relative flex size-2">
        <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", map.dot)} />
        <span className={cn("relative inline-flex size-2 rounded-full", map.dot)} />
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
