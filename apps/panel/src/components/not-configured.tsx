import { ErrorState } from "./ui-walt";

export function NotConfigured() {
  return (
    <ErrorState title="Falta conectar la base">
      Este entorno no tiene <code className="font-mono">SUPABASE_URL</code> y <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>. En producción el panel nunca
      muestra datos de ejemplo: cargá las variables y volvé a publicar.
    </ErrorState>
  );
}
