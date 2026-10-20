"use client";

import { Check, Mic, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { LandingCopy } from "@/lib/landing/copy.es";

// La demo real, animada en HTML y CSS: audio → transcripción → vista previa con advertencia → «Dale» → publicado.
// Cada paso aparece a su tiempo y la secuencia vuelve a empezar. Con prefers-reduced-motion se ve el final, quieto.
const STEPS_MS = [600, 1700, 2600, 3900, 6200, 7000, 11000];
const LAST = STEPS_MS.length;
const WAVE = [6, 11, 15, 9, 13, 17, 8, 12, 16, 10, 14, 7, 12, 9, 15, 11, 6];

export function PhoneDemo({ copy }: { copy: LandingCopy["phone"] }) {
  const [step, setStep] = useState(LAST);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setStep(0);
      timers = STEPS_MS.map((ms, i) => setTimeout(() => (i === LAST - 1 ? run() : setStep(i + 1)), ms));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  const show = (n: number) => step >= n;
  return (
    <figure className="flex flex-col items-center">
      <div className="wl-phone" aria-hidden="true">
        <div className="wl-phone-screen">
          <div className="wl-phone-top">
            <span className="grid size-9 place-items-center rounded-full bg-[#2bd97c] text-sm font-bold text-[#07130c]">EF</span>
            <span className="leading-tight">
              <span className="block text-[0.92rem] font-semibold text-[#eef2f6]">{copy.assistant}</span>
              <span className="block text-xs text-[#8fd9b0]">{copy.status}</span>
            </span>
          </div>
          <div className="wl-chat relative">
            <Bubble from="client" hidden={!show(1)}>
              <span className="flex items-center gap-2">
                <Play className="size-4 fill-current" />
                <span className="wl-wave">
                  {WAVE.map((h, i) => (
                    <i key={i} style={{ height: h }} />
                  ))}
                </span>
                <span className="text-xs opacity-80">{copy.audio}</span>
              </span>
            </Bubble>
            <Bubble from="bot" hidden={!show(2)}>
              <span className="flex items-start gap-1.5">
                <Mic className="mt-0.5 size-3.5 shrink-0 opacity-80" />
                <span>«{copy.transcript}»</span>
              </span>
            </Bubble>
            <Bubble from="bot" hidden={!show(3)}>
              <span>{copy.received}</span>
            </Bubble>
            <Bubble from="bot" hidden={!show(4)}>
              <span className="block">{copy.previewQuestion}</span>
              <span className="wl-mini-site block">
                <span className="block bg-[#b45309] px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-white">{copy.siteName}</span>
                {copy.products.map((p) => (
                  <span key={p.name} className="wl-mini-site-row">
                    <span>{p.name}</span>
                    <span className="tabular-nums">
                      <s className="mr-1.5 text-[#6f6253]">{p.before}</s>
                      <b>{p.after}</b>
                    </span>
                  </span>
                ))}
              </span>
              <span className="wl-mini-warning block">{copy.warning}</span>
              <span className="wl-chat-buttons">
                <span data-pressed={show(5)}>{copy.yes}</span>
                <span>{copy.no}</span>
              </span>
            </Bubble>
            <Bubble from="bot" hidden={!show(6)}>
              <span className="flex items-center gap-1.5 font-semibold text-[#8ff0bb]">
                <Check className="size-4" strokeWidth={3} />
                {copy.published}
              </span>
            </Bubble>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 max-w-[340px] text-center text-sm text-(--wl-muted)">{copy.caption}</figcaption>
    </figure>
  );
}

function Bubble({ from, hidden, children }: { from: "client" | "bot"; hidden: boolean; children: React.ReactNode }) {
  return (
    <span className="wl-bubble block" data-from={from} data-hidden={hidden}>
      {children}
    </span>
  );
}
