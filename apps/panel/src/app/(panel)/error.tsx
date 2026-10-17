"use client";

import { ErrorState } from "@/components/ui-dale";

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="No pudimos cargar esta pantalla"
      action={
        <button onClick={reset} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          Reintentar
        </button>
      }
    >
      {error.message || "Error inesperado."} {error.digest && <span className="font-mono text-xs">({error.digest})</span>}
    </ErrorState>
  );
}
