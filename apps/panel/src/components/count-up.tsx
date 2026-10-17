"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/** Número que cuenta hacia arriba cuando cambia. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, format, reduce]);
  // El texto inicial es el valor final (SSR y sin animación); el efecto anima desde el anterior.
  return <span ref={ref}>{format(value)}</span>;
}
