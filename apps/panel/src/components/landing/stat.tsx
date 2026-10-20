"use client";

import { useEffect, useState } from "react";
import { useInView, useMotionOk } from "./use-in-view";

type Figure = { kind: "percent"; value: number } | { kind: "ofTen"; value: number };

/** Una cifra del problema: cuenta hasta su valor al entrar en pantalla, con su gráfica. */
export function Stat({ figure, ofTen, text, source, url }: { figure: Figure; ofTen: string; text: string; source: string; url: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  // Sin JavaScript o con movimiento reducido: la cifra y la gráfica quietas en su valor final.
  const animate = useMotionOk();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView || !animate) return;
    const start = performance.now();
    const dur = figure.kind === "percent" ? 1100 : 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(figure.value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, animate, figure]);

  const shown = animate ? n : figure.value;
  const filled = !animate || inView;
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <p className="wl-num text-[3.5rem] leading-none sm:text-[4.25rem]" aria-label={figure.kind === "percent" ? `${figure.value}%` : `${figure.value} ${ofTen}`}>
        {figure.kind === "percent" ? (
          <>
            {shown}
            <span className="text-[0.55em]">%</span>
          </>
        ) : (
          <>
            {shown} <span className="text-[0.4em] font-medium tracking-normal">{ofTen}</span>
          </>
        )}
      </p>
      {figure.kind === "percent" ? (
        <div className="wl-bar" aria-hidden="true">
          <i style={{ width: filled ? `${figure.value}%` : "0%" }} />
        </div>
      ) : (
        <div className="wl-dots" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} data-on={filled && i < figure.value} />
          ))}
        </div>
      )}
      <p className="text-[1.05rem] leading-snug">{text}</p>
      <p className="text-sm text-(--wl-cream-muted)">
        Fuente:{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="wl-link">
          {source}
        </a>
      </p>
    </div>
  );
}
