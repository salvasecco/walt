"use client";

import { useId, useState } from "react";
import type { LandingCopy } from "@/lib/landing/copy.es";

export function PanelTour({ copy }: { copy: LandingCopy["tour"] }) {
  const [active, setActive] = useState(copy.tabs[0].id);
  const base = useId();
  const tab = copy.tabs.find((t) => t.id === active) ?? copy.tabs[0];
  return (
    <section id="panel" className="wl-dark wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <h2 className="wl-h2 mt-4 max-w-[22ch]">{copy.title}</h2>
        <p className="wl-lead mt-5">{copy.lead}</p>
        <div role="tablist" aria-label={copy.kicker} className="wl-tabs mt-10">
          {copy.tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={t.id === active}
              aria-controls={`${base}-panel`}
              className="wl-tab"
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab.id}`} className="mt-6">
          <p className="max-w-2xl text-[1.05rem] text-(--wl-muted)">{tab.caption}</p>
          <div className="wl-shot mt-6">
            <div className="wl-shot-bar" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- capturas ya optimizadas, con srcset propio */}
            <img
              key={tab.id}
              src={`/landing/panel-${tab.id}-1440.jpg`}
              srcSet={`/landing/panel-${tab.id}-720.jpg 720w, /landing/panel-${tab.id}-1440.jpg 1440w`}
              sizes="(min-width: 1120px) 1056px, 100vw"
              width={1440}
              height={900}
              loading="lazy"
              decoding="async"
              alt={`Captura de la pantalla ${tab.label} del panel de Walt, con datos de ejemplo.`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
