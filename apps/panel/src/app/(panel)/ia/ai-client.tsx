"use client";

import { Check, KeyRound, Loader2, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { clearAiKey, saveAiCaps, saveAiKey, setAiMode, type ActionResult } from "@/app/ai-actions";
import { Chip, Mono, Notice, PanelTitle, Surface } from "@/components/ui-walt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AiMode, AiSettingView, LedgerRow, WalletView } from "@/lib/ai";
import { dateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";

const MODES: { mode: AiMode; title: string; text: string }[] = [
  { mode: "platform", title: "Clave de Walt", text: "Walt pone la IA, como hasta ahora. El costo de cada pedido queda registrado igual." },
  { mode: "byok", title: "Tu clave de Anthropic", text: "Tu API key, cifrada en Supabase Vault. Se valida al cargarla y nunca se vuelve a mostrar." },
  { mode: "credits", title: "Créditos prepagos", text: "Un saldo en Walt: cada pedido descuenta su costo más el margen. Con alerta de saldo bajo." },
  { mode: "claude_code", title: "Claude Code de la agencia", text: "Corre en tu compu o en tu CI, con tu suscripción. Walt le pasa las tareas sin tener tu login." },
];

const SHORT: Record<AiMode, string> = { platform: "Clave de Walt", byok: "Tu clave", credits: "Créditos", claude_code: "Claude Code" };

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.demo) return void toast.warning(r.message);
      toast.success(r.message ?? "Listo");
      after?.();
      router.refresh();
    });
  return { pending, run };
}

/** El modo de la agencia: cuatro opciones y, abajo, lo de la elegida (clave, saldo o explicación). */
export function AgencyMode({ agency, wallet, movements, canEdit }: { agency: AiSettingView | null; wallet: WalletView | null; movements: LedgerRow[]; canEdit: boolean }) {
  const active: AiMode = agency?.mode ?? "platform";
  const [selected, setSelected] = useState<AiMode>(active);
  const { pending, run } = useAction();
  const choose = (mode: AiMode) => {
    setSelected(mode);
    if (!canEdit || mode === active) return;
    if (mode === "byok" && !agency?.hasKey) return; // se activa al guardar la clave
    if (mode === "platform" && agency?.hasKey && !window.confirm("Volver a la clave de Walt borra la clave de Anthropic guardada. ¿Seguimos?")) return setSelected(active);
    run(() => setAiMode(null, mode));
  };
  return (
    <Surface className="flex flex-col gap-5 p-4 sm:p-6">
      <PanelTitle right={pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}>¿Cómo pagás la IA?</PanelTitle>
      <div role="radiogroup" aria-label="Modo de IA de la agencia" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {MODES.map((m) => {
          const on = selected === m.mode;
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending || (!canEdit && m.mode !== selected)}
              onClick={() => choose(m.mode)}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border p-3.5 text-left transition-colors disabled:cursor-not-allowed",
                on ? "border-line-strong bg-white/[0.06]" : "border-line bg-surface-2 hover:bg-white/[0.03]",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{m.title}</span>
                {active === m.mode ? <Chip tone="ok" dot>en uso</Chip> : on ? <Chip>elegido</Chip> : null}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{m.text}</span>
            </button>
          );
        })}
      </div>
      {!canEdit && <p className="-mt-2 text-xs text-muted-foreground">Lo cambia un admin o el dueño.</p>}
      <div className="border-t border-line pt-5">
        {selected === "platform" && <p className="text-sm text-muted-foreground">Walt pone la clave y el modelo. Para la beta no hay cobro aparte; el costo de cada pedido se ve abajo.</p>}
        {selected === "byok" && <ByokPanel projectId={null} setting={agency?.mode === "byok" || agency?.hasKey ? agency : null} canEdit={canEdit} />}
        {selected === "credits" && <CreditsPanel wallet={wallet} movements={movements} setting={agency?.mode === "credits" ? agency : null} canEdit={canEdit} />}
        {selected === "claude_code" && <ClaudeCodePanel />}
      </div>
    </Surface>
  );
}

function ByokPanel({ projectId, setting, canEdit }: { projectId: string | null; setting: AiSettingView | null; canEdit: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Clave de Anthropic</h3>
        {setting?.hasKey ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-ok" />
            <Mono>••••{setting.keyHint}</Mono>
            <span className="text-muted-foreground">validada el {dateTime(setting.keyValidatedAt)}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Sin clave cargada.</p>
        )}
        {canEdit && <KeyForm projectId={projectId} hasKey={!!setting?.hasKey} />}
        <p className="text-xs text-muted-foreground">Se valida con una consulta a la API de modelos de Anthropic (no gasta tokens), se guarda cifrada en Supabase Vault y no se loguea. Después solo se ven los últimos 4 caracteres.</p>
      </div>
      {setting && canEdit && <CapsForm projectId={projectId} setting={setting} />}
    </div>
  );
}

export function KeyForm({ projectId, hasKey, compact }: { projectId: string | null; hasKey: boolean; compact?: boolean }) {
  const [key, setKey] = useState("");
  const { pending, run } = useAction();
  return (
    <form
      className={cn("flex flex-col gap-2", !compact && "sm:flex-row")}
      onSubmit={(e) => {
        e.preventDefault();
        // La clave no queda en el estado después de mandarla.
        const value = key;
        setKey("");
        run(() => saveAiKey(projectId, value));
      }}
    >
      <label htmlFor={`key-${projectId ?? "agencia"}`} className="sr-only">
        API key de Anthropic
      </label>
      <Input
        id={`key-${projectId ?? "agencia"}`}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={hasKey ? "Pegá una clave nueva para reemplazarla" : "sk-ant-…"}
        className="h-9 flex-1 font-mono text-xs md:text-xs"
      />
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending || key.trim().length < 20}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Validar y guardar
        </Button>
        {hasKey && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            aria-label="Borrar la clave"
            title="Borrar la clave"
            className="text-danger hover:text-danger"
            onClick={() => {
              if (window.confirm("¿Borrar la clave guardada? Sin clave, este modo no corre.")) run(() => clearAiKey(projectId));
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </form>
  );
}

function CapsForm({ projectId, setting }: { projectId: string | null; setting: AiSettingView }) {
  const [monthly, setMonthly] = useState(setting.monthlyCapUsd?.toString() ?? "");
  const [perRequest, setPerRequest] = useState(setting.requestCapUsd?.toString() ?? "");
  const [alert, setAlert] = useState(String(setting.alertPct));
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAiCaps(projectId, { monthlyCapUsd: monthly === "" ? null : Number(monthly), requestCapUsd: perRequest === "" ? null : Number(perRequest), alertPct: Number(alert) }));
      }}
    >
      <h3 className="text-sm font-semibold">Topes y alertas</h3>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Por mes" suffix="USD">
          <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="sin tope" className={inputCls} />
        </Field>
        <Field label="Por pedido" suffix="USD">
          <input inputMode="decimal" value={perRequest} onChange={(e) => setPerRequest(e.target.value)} placeholder="sin tope" className={inputCls} />
        </Field>
        <Field label="Avisar al" suffix="%">
          <input inputMode="numeric" value={alert} onChange={(e) => setAlert(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Button type="submit" variant="outline" size="lg" disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Guardar topes
      </Button>
      <p className="text-xs text-muted-foreground">Tope del mes, tope por pedido y a qué porcentaje del tope del mes se avisa a la agencia. Vacío: sin tope.</p>
    </form>
  );
}

const inputCls =
  "h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2 text-sm tnum outline-none transition-colors placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

function Field({ label, suffix, children }: { label: string; suffix: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span>
        {label} <span className="text-faint">({suffix})</span>
      </span>
      {children}
    </label>
  );
}

function CreditsPanel({ wallet, movements, setting, canEdit }: { wallet: WalletView | null; movements: LedgerRow[]; setting: AiSettingView | null; canEdit: boolean }) {
  const low = wallet && wallet.balanceUsd < wallet.lowBalanceUsd;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4 text-faint" /> Billetera
        </h3>
        {wallet ? (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className={cn("text-3xl font-semibold tracking-tight tnum", low && "text-warn")}>USD {wallet.balanceUsd.toFixed(2)}</span>
              {low && <Chip tone="warn">saldo bajo</Chip>}
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta con menos de USD {wallet.lowBalanceUsd.toFixed(2)} · margen sobre el costo del modelo {wallet.markupPct}% · recarga automática {wallet.autoRecharge ? `de USD ${wallet.autoRechargeUsd?.toFixed(2)}` : "apagada"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay billetera: se crea con la primera recarga.</p>
        )}
        <Button type="button" size="lg" disabled className="self-start">
          Recargar
        </Button>
        <p className="text-xs text-muted-foreground">Las recargas con Stripe y Mercado Pago llegan en el R2.</p>
        {setting && canEdit && <CapsForm projectId={null} setting={setting} />}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold">Movimientos</h3>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos.</p>
        ) : (
          <ul className="flex flex-col">
            {movements.map((m) => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line py-2 text-sm last:border-0">
                <span className="min-w-0 truncate">
                  {m.kind === "recharge" ? "Recarga" : m.kind === "adjustment" ? "Ajuste" : m.kind === "agent" ? "Agente de código" : "Pedido"}
                  {m.model && <span className="text-muted-foreground"> · {m.model}</span>}
                </span>
                <Mono className={cn("text-right text-xs", m.wallet_delta_usd > 0 ? "text-ok" : "text-foreground/85")}>
                  {m.wallet_delta_usd > 0 ? "+" : ""}
                  {m.wallet_delta_usd.toFixed(3)}
                </Mono>
                <Mono className="text-[11px] text-muted-foreground">{dateTime(m.created_at)}</Mono>
                <Mono className="text-right text-[11px] text-muted-foreground">{m.balance_after_usd == null ? "" : `saldo ${m.balance_after_usd.toFixed(2)}`}</Mono>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ClaudeCodePanel() {
  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <p>La agencia corre Claude Code en su compu o en su CI, con su propia cuenta. Walt le pasa las tareas de código (como canal o servidor MCP) y recibe el resultado; la vista previa, el «Dale» del cliente y las reglas siguen igual.</p>
      <ul className="flex flex-col gap-1.5 text-muted-foreground">
        <li>· Walt nunca pide ni guarda el login de tu suscripción de Claude.</li>
        <li>· Solo aplica al carril de código; clasificar los pedidos sigue usando la clave de Walt o la tuya.</li>
        <li>· El detalle de cómo se conecta lo define el plan del producto (docs/PRODUCCION.md).</li>
      </ul>
      <Notice tone="info">Este modo queda anotado para la agencia; la conexión con Claude Code todavía no está disponible.</Notice>
    </div>
  );
}

type Row = { id: string; name: string; setting: AiSettingView | null; effective: AiMode; month: { requests: number; cost: number; perRequest: number | null } };

/** Excepciones por proyecto y su costo del mes. */
export function ProjectModes({ rows, agencyMode, agencyHasKey, canEdit }: { rows: Row[]; agencyMode: AiMode; agencyHasKey: boolean; canEdit: boolean }) {
  return (
    <ul>
      {rows.map((r) => (
        <ProjectRow key={r.id} r={r} agencyMode={agencyMode} agencyHasKey={agencyHasKey} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function ProjectRow({ r, agencyMode, agencyHasKey, canEdit }: { r: Row; agencyMode: AiMode; agencyHasKey: boolean; canEdit: boolean }) {
  const { pending, run } = useAction();
  const [showKey, setShowKey] = useState(false);
  const value = r.setting?.mode ?? "inherit";
  const needsKey = r.effective === "byok" && !r.setting?.hasKey && !agencyHasKey;
  return (
    <li className="flex flex-col gap-3 border-b border-line px-5 py-3.5 last:border-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground tnum">
            {r.month.requests} pedidos este mes · USD {r.month.cost.toFixed(2)} · {r.month.perRequest == null ? "—" : `USD ${r.month.perRequest.toFixed(3)} por pedido`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <select
            aria-label={`Modo de IA de ${r.name}`}
            value={value}
            disabled={!canEdit || pending}
            onChange={(e) => {
              const v = e.target.value as AiMode | "inherit";
              if (v === "byok" && !r.setting?.hasKey && !agencyHasKey) return setShowKey(true);
              if (v === "inherit" && r.setting?.hasKey && !window.confirm("Usar el modo de la agencia borra la clave de este proyecto. ¿Seguimos?")) return;
              run(() => setAiMode(r.id, v));
            }}
            className="h-8 rounded-md border border-input bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
          >
            <option value="inherit">Igual que la agencia ({SHORT[agencyMode]})</option>
            {(["platform", "byok", "credits", "claude_code"] as const).map((m) => (
              <option key={m} value={m}>
                {SHORT[m]}
              </option>
            ))}
          </select>
          {canEdit && (r.effective === "byok" || showKey) && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((s) => !s)}>
              <KeyRound /> {r.setting?.hasKey ? `••••${r.setting.keyHint}` : "Clave"}
            </Button>
          )}
        </div>
      </div>
      {needsKey && <p className="text-xs text-warn">Sin clave: cargá una para el proyecto o para la agencia.</p>}
      {showKey && canEdit && (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="mb-2 text-xs text-muted-foreground">Clave solo para {r.name}. Si no tiene, usa la de la agencia.</p>
          <KeyForm projectId={r.id} hasKey={!!r.setting?.hasKey} compact />
        </div>
      )}
    </li>
  );
}
