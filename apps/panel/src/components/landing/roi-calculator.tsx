"use client";

import { Link2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CURRENCIES, type CurrencyCode } from "@/lib/landing/config";
import type { LandingCopy } from "@/lib/landing/copy.es";
import {
  LIMITS,
  clampInput,
  computeRoi,
  decodeInputs,
  encodeInputs,
  roiBucket,
  roundHours,
  roundMoney,
  type InputKey,
  type RoiInputs,
} from "@/lib/landing/roi";
import { track } from "@/lib/landing/track";

const noSubscribe = () => () => {};

const ORDER: InputKey[] = ["clients", "requestsPerClient", "simplePct", "minutesPerRequest", "hourlyCost", "maintenancePrice", "extraPct", "extraPrice"];

export function RoiCalculator({ copy }: { copy: LandingCopy["calculator"] }) {
  // Un link compartido trae los números en la URL; lo que la persona toca después tiene prioridad.
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const fromUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    const m = params.get("moneda");
    return { inputs: decodeInputs(params), currency: (m === "UYU" || m === "BRL" ? m : "USD") as CurrencyCode };
  }, [search]);
  const [edited, setEdited] = useState<RoiInputs | null>(null);
  const [pickedCurrency, setPickedCurrency] = useState<CurrencyCode | null>(null);
  const inputs = edited ?? fromUrl.inputs;
  const currency = pickedCurrency ?? fromUrl.currency;
  const [shared, setShared] = useState(false);
  const touched = useRef(false);
  const reported = useRef(false);

  const r = useMemo(() => computeRoi(inputs), [inputs]);

  // Medir que se usó (el plan que resultó y el tramo del retorno), una vez y sin los valores.
  useEffect(() => {
    if (!touched.current || reported.current) return;
    const t = setTimeout(() => {
      reported.current = true;
      track("calc_used", { plan: r.choice.plan.id, roi: roiBucket(r.roi), currency });
    }, 1500);
    return () => clearTimeout(t);
  }, [r, currency]);

  const cur = CURRENCIES[currency];
  const fmtMoney = (v: number) => new Intl.NumberFormat(cur.locale, { style: "currency", currency: cur.code, maximumFractionDigits: 0 }).format(v);
  // Resultados redondeados (no exagerar); los precios de Walt, exactos.
  const money = (usd: number) => fmtMoney(roundMoney(usd * cur.perUsd));
  const price = (usd: number) => fmtMoney(currency === "USD" ? usd : Math.round(usd * cur.perUsd));
  const fmt = (n: number, digits = 0) => new Intl.NumberFormat("es-UY", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

  const set = (key: InputKey, value: number) => {
    touched.current = true;
    setEdited({ ...inputs, [key]: clampInput(key, value) });
  };

  const share = async () => {
    const qs = encodeInputs(inputs, currency !== "USD" ? { moneda: currency } : undefined);
    const url = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}#calculadora`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.history.replaceState(null, "", url);
    }
    setShared(true);
    setTimeout(() => setShared(false), 2500);
    track("calc_shared", { plan: r.choice.plan.id, currency });
  };

  const negative = r.net < 0;
  return (
    <section id="calculadora" className="wl-cream wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <h2 className="wl-h2 mt-4">{copy.title}</h2>
        <p className="wl-lead mt-5">{copy.lead}</p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <form className="space-y-7" onSubmit={(e) => e.preventDefault()} aria-label={copy.title}>
            {ORDER.map((key) => {
              const meta = copy.inputs[key];
              const lim = LIMITS[key];
              const id = `roi-${key}`;
              return (
                <div key={key}>
                  <div className="flex items-end justify-between gap-4">
                    <label htmlFor={id} className="text-[1rem] font-semibold leading-snug">
                      {meta.label}
                      <span className="mt-0.5 block text-[0.85rem] font-normal text-(--wl-cream-muted)">{meta.hint}</span>
                    </label>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        className="wl-number"
                        min={lim.min}
                        max={lim.max}
                        step={lim.step}
                        value={inputs[key]}
                        onChange={(e) => set(key, Number(e.target.value))}
                      />
                      <span className="w-8 text-sm text-(--wl-cream-muted)" aria-hidden={!meta.unit}>
                        {meta.unit}
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    className="wl-range mt-2"
                    aria-label={meta.label}
                    min={lim.min}
                    max={lim.max}
                    step={lim.step}
                    value={inputs[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                  />
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <label htmlFor="roi-moneda" className="text-[0.95rem] font-semibold">
                {copy.currency}
              </label>
              <select id="roi-moneda" className="wl-select" value={currency} onChange={(e) => setPickedCurrency(e.target.value as CurrencyCode)}>
                {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                  <option key={c} value={c}>
                    {CURRENCIES[c].label}
                  </option>
                ))}
              </select>
              {cur.source && <span className="text-[0.85rem] text-(--wl-cream-muted)">{copy.currencyNote.replace("{date}", cur.source)}</span>}
            </div>
            {/* En el celular, el resultado queda a la vista mientras se mueven los valores (el detalle está abajo). */}
            <div className="wl-result sticky bottom-3 z-10 flex items-center justify-between gap-3 px-5 py-3 shadow-[0_12px_30px_-12px_rgb(0_0_0/0.5)] lg:hidden" aria-hidden="true">
              <span className="text-sm leading-tight text-(--wl-muted)">{copy.out.net}</span>
              <span className="text-right">
                <span className={`wl-num block text-[1.4rem] leading-none ${negative ? "text-(--wl-red)" : "text-(--wl-green)"}`}>{money(r.net)}</span>
                {!negative && r.paybackDays !== null && (
                  <span className="mt-1 block text-xs text-(--wl-muted)">
                    {copy.out.payback} {copy.out.paybackDays.replace("{n}", String(r.paybackDays))}
                  </span>
                )}
              </span>
            </div>
          </form>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="wl-result p-6 sm:p-8" aria-live="polite">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-6">
                <Out label={copy.out.hours} value={fmt(roundHours(r.hoursSaved))} />
                <Out label={copy.out.saved} value={money(r.moneySaved)} />
                <Out label={copy.out.extra} value={money(r.extraNet)} note={copy.out.extraNote} />
                <Out
                  label={copy.out.plan}
                  value={price(r.choice.monthlyCost)}
                  note={`${r.choice.plan.name} · ${copy.out.planNote.replace("{projects}", String(inputs.clients))}`}
                />
              </dl>
              <div className="mt-7 border-t border-(--wl-line) pt-6">
                <p className="text-sm text-(--wl-muted)">{copy.out.net}</p>
                <p className={`wl-num mt-1 text-[3rem] leading-none ${negative ? "text-(--wl-red)" : "text-(--wl-green)"}`}>{money(r.net)}</p>
                {negative ? (
                  <p className="mt-4 text-[0.98rem] leading-snug">{copy.out.negative}</p>
                ) : (
                  <dl className="mt-5 grid grid-cols-2 gap-6">
                    <Out label={copy.out.roi} value={copy.out.roiTimes.replace("{n}", fmt(r.roi, 1))} note={copy.out.roiNote} />
                    <Out
                      label={copy.out.payback}
                      value={r.paybackDays === null ? copy.out.paybackNever : copy.out.paybackDays.replace("{n}", String(r.paybackDays))}
                    />
                  </dl>
                )}
              </div>
              <button type="button" onClick={share} className="wl-btn wl-btn-ghost mt-7 w-full">
                <Link2 className="size-4" aria-hidden="true" />
                {shared ? copy.out.shared : copy.out.share}
              </button>
            </div>
            <details className="mt-6 text-[0.95rem]">
              <summary className="cursor-pointer font-semibold">{copy.how.title}</summary>
              <ul className="mt-3 space-y-2 text-(--wl-cream-muted)">
                {copy.how.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function Out({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-(--wl-muted)">{label}</dt>
      <dd className="wl-num mt-1 text-[1.6rem] leading-tight">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-(--wl-muted)">{note}</dd>}
    </div>
  );
}
