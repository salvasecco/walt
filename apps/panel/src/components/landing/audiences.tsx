"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import type { LandingCopy } from "@/lib/landing/copy.es";
import { track } from "@/lib/landing/track";

export function Audiences({ copy }: { copy: LandingCopy["audiences"] }) {
  const [active, setActive] = useState(copy.tabs[0].id);
  const base = useId();
  const tab = copy.tabs.find((t) => t.id === active) ?? copy.tabs[0];
  return (
    <section id="para-quien" className="wl-cream wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <div role="tablist" aria-label={copy.kicker} className="wl-tabs mt-5">
          {copy.tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={t.id === active}
              aria-controls={`${base}-panel`}
              className="wl-tab"
              onClick={() => {
                setActive(t.id);
                track("cta_click", { cta: "demo", section: "para-quien", audience: t.id });
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab.id}`} className="mt-10 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <h2 className="wl-h2 max-w-[18ch]">{tab.title}</h2>
          <ul className="space-y-5">
            {tab.points.map((p) => (
              <li key={p} className="flex gap-3 text-[1.1rem] leading-snug">
                <Check className="mt-1 size-5 shrink-0 text-(--wl-green-on-cream)" strokeWidth={2.5} aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
