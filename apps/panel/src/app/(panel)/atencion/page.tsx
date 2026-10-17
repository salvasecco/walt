import type { Metadata } from "next";
import { NotConfigured } from "@/components/not-configured";
import { Notice, PageHeader, SampleBadge } from "@/components/ui-dale";
import { getAttention, type AttentionData } from "@/lib/agency";
import { NotConfiguredError } from "@/lib/data";
import { dataMode } from "@/lib/env";
import { AttentionBoard } from "./board";

export const metadata: Metadata = { title: "Atención" };

export default async function AtencionPage() {
  let data: AttentionData;
  try {
    data = await getAttention();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atención"
        subtitle="Cada proyecto en una columna, según lo más urgente que tiene. Se actualiza solo."
        right={dataMode() === "ejemplo" && <SampleBadge />}
      />
      {!data.clientsReady && (
        <Notice tone="muted">Falta aplicar la migración 0003: el tablero usa el nombre de cliente de cada proyecto.</Notice>
      )}
      <AttentionBoard board={data.board} now={data.now} />
    </div>
  );
}
