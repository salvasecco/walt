"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui-dale";

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="No pudimos cargar esta pantalla"
      action={
        <Button variant="outline" size="lg" onClick={reset}>
          Reintentar
        </Button>
      }
    >
      {error.message || "Error inesperado."} {error.digest && <span className="font-mono text-xs">({error.digest})</span>}
    </ErrorState>
  );
}
