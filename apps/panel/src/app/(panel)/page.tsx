import { getLiveSnapshot, NotConfiguredError } from "@/lib/data";
import { dataMode, env, publicSupabase } from "@/lib/env";
import { NotConfigured } from "@/components/not-configured";
import { LiveBoard } from "./live-board";

export default async function EnVivoPage() {
  try {
    const snapshot = await getLiveSnapshot();
    return <LiveBoard initial={snapshot} supabase={publicSupabase()} sample={dataMode() === "ejemplo"} siteUrl={env.demoSiteUrl} />;
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
}
