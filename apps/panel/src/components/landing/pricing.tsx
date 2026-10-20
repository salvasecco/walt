"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { ALL_PLANS_INCLUDE, PLANS, PRICING_TERMS, type Cycle } from "@/lib/landing/config";
import type { LandingCopy } from "@/lib/landing/copy.es";
import { CtaLink } from "./cta-link";

export function Pricing({ copy }: { copy: LandingCopy["pricing"] }) {
  const [cycle, setCycle] = useState<Cycle>("mensual");
  return (
    <section id="precios" className="wl-dark wl-section">
      <div className="wl-container">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="wl-kicker">{copy.kicker}</p>
            <h2 className="wl-h2 mt-4 max-w-[20ch]">{copy.title}</h2>
            <p className="mt-4 inline-flex rounded-full border border-(--wl-line-strong) px-3 py-1 text-sm font-semibold">{copy.label}</p>
          </div>
          <div role="radiogroup" aria-label="Forma de pago" className="wl-tabs self-start md:self-auto">
            {(["mensual", "anual"] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cycle === c} className="wl-tab" onClick={() => setCycle(c)}>
                {c === "mensual" ? copy.monthly : `${copy.yearly} · ${copy.yearlyNote}`}
              </button>
            ))}
          </div>
        </div>

        {/* En escritorio las tarjetas comparten filas (subgrid): precios, listas y botones quedan alineados. */}
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const price = cycle === "anual" ? plan.yearlyPerMonth : plan.monthly;
            return (
              <article
                key={plan.id}
                className="wl-card wl-plan flex flex-col p-7 lg:row-span-7 lg:grid lg:grid-rows-subgrid lg:gap-y-0"
                data-highlight={plan.highlight ? "true" : "false"}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="wl-h3 text-[1.4rem]">{plan.name}</h3>
                  {plan.highlight && <span className="text-xs font-semibold text-(--wl-green)">{copy.popular}</span>}
                </div>
                <p className="mt-2 text-[0.98rem] leading-snug text-(--wl-muted)">{plan.forWhom}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-sm text-(--wl-muted)">USD</span>
                  <span className="wl-num text-[3.25rem] leading-none">{price}</span>
                  <span className="text-(--wl-muted)">{copy.perMonth}</span>
                </p>
                <p className="mt-1 h-5 text-sm text-(--wl-muted)">{cycle === "anual" ? `${copy.billedYearly} (USD ${price * 12})` : ""}</p>
                <ul className="mt-6 space-y-3 text-[0.98rem]">
                  {plan.includes.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-(--wl-green)" strokeWidth={2.5} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-(--wl-muted)">
                  {plan.soon.length > 0 && (
                    <>
                      <span className="font-semibold">{copy.soonLabel}:</span> {plan.soon.join(" · ")}
                    </>
                  )}
                </p>
                <CtaLink
                  href={`/registro?plan=${plan.id}&ciclo=${cycle}`}
                  cta="plan"
                  section="precios"
                  plan={plan.id}
                  cycle={cycle}
                  className={`wl-btn mt-8 ${plan.highlight ? "wl-btn-primary" : "wl-btn-ghost"}`}
                >
                  {copy.cta.replace("{plan}", plan.name)}
                </CtaLink>
              </article>
            );
          })}
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-(--wl-muted)">{copy.everyPlan}</h3>
            <ul className="mt-4 space-y-2.5 text-[0.98rem]">
              {ALL_PLANS_INCLUDE.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-(--wl-green)" strokeWidth={2.5} aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <ul className="space-y-2.5 text-[0.95rem] text-(--wl-muted) md:pt-9">
            {copy.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <p className="sr-only">
          Precios en dólares estadounidenses. Cambio de código extra: USD {PRICING_TERMS.extraCodeChangeUsd}. Comisión: {PRICING_TERMS.commissionOwnPct}%.
        </p>
      </div>
    </section>
  );
}
