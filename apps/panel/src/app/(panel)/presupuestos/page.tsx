import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { NotConfigured } from "@/components/not-configured";
import { EmptyState, PageHeader, SampleBadge } from "@/components/ui-dale";
import { getQuotes, NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { QuoteCard } from "./quote-card";

export const metadata: Metadata = { title: "Presupuestos" };

export default async function PresupuestosPage() {
  let rows;
  try {
    rows = await getQuotes();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Presupuestos" subtitle="Borradores que arma la IA cuando un cliente pide algo nuevo. Ajustalos y mandalos." right={dataMode() === "ejemplo" && <SampleBadge />} />
      {rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-5" />} title="Sin presupuestos">
          Cuando un cliente pida una función nueva, el borrador aparece acá.
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((r) => (
            <QuoteCard key={r.quote.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
