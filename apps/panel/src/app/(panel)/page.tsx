import { getLiveSnapshot, NotConfiguredError, type LiveSnapshot } from "@/lib/data";
import { dataMode, env, publicSupabase } from "@/lib/env";
import { NotConfigured } from "@/components/not-configured";
import { LiveBoard } from "./live-board";

export default async function EnVivoPage() {
  let snapshot: LiveSnapshot;
  try {
    snapshot = await getLiveSnapshot();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  return <LiveBoard initial={snapshot} supabase={publicSupabase()} sample={dataMode() === "ejemplo"} siteUrl={env.demoSiteUrl} />;
}
