"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/landing/track";

/** Un CTA que mide el clic (qué botón y desde qué sección) sin datos personales. */
export function CtaLink({
  href,
  cta,
  section,
  plan,
  cycle,
  className,
  children,
}: {
  href: string;
  cta: "beta" | "calcular" | "plan" | "registro" | "demo";
  section: string;
  plan?: string;
  cycle?: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = () => track("cta_click", { cta, section, ...(plan ? { plan } : {}), ...(cycle ? { cycle } : {}) });
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick} prefetch={false}>
      {children}
    </Link>
  );
}
