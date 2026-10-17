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
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, format, reduce]);
  return <span ref={ref}>{format(reduce ? value : prev.current)}</span>;
}
