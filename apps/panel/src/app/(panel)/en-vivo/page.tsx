import { getLiveSnapshot, NotConfiguredError, type LiveSnapshot } from "@/lib/data";
import { dataMode, env, publicSupabase } from "@/lib/env";
import { getScope } from "@/lib/session";
import { NotConfigured } from "@/components/not-configured";
import { LiveBoard } from "../live-board";

export default async function EnVivoPage() {
  let snapshot: LiveSnapshot;
  try {
    snapshot = await getLiveSnapshot();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <NotConfigured />;
    throw e;
  }
  const { viewer } = await getScope();
  const pub = publicSupabase();
  const supabase = pub && { ...pub, auth: viewer.kind === "user" ? ("user" as const) : ("anon" as const) };
  return <LiveBoard initial={snapshot} supabase={supabase} sample={dataMode() === "ejemplo"} siteUrl={env.demoSiteUrl} />;
}
