/**
 * Idempotent seed with the fixed ids of SPEC §5: agency, bakery project, rules v1,
 * initial live version from the fixture, and three invites (client, agency, jury).
 * With migration 0003 it also creates the bakery's client (linked to its project) and two sample
 * clients with their projects and requests (is_sample = true), rebuilt on every run.
 * Goes through supabase-js with the service role (HTTPS only).
 * Usage: pnpm seed
 */
import { assistantName, DEFAULT_RULES, inviteToken, loadEnv, SEED_IDS, type Role } from '@walt/core';
import { bakeryContent } from '@walt/core/fixtures';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSampleClientRows, MABEL_CLIENT, SAMPLE_PROJECT_IDS } from '../apps/panel/src/lib/sample-clients.mts';
import { connect, must, runMain, schemaStatus } from './lib/db.js';

const HOUR = 3600_000;
const INVITES: { label: string; role: Role; maxUses: number; ttlMs: number }[] = [
  { label: 'Cliente (Mabel)', role: 'cliente', maxUses: 5, ttlMs: 7 * 24 * HOUR },
  { label: 'Agencia', role: 'agencia', maxUses: 5, ttlMs: 7 * 24 * HOUR },
  { label: 'Jurado', role: 'cliente', maxUses: 50, ttlMs: 48 * HOUR },
];

runMain('seed', async () => {
  const env = loadEnv();
  const db = connect(env);
  const siteUrl = env.DEMO_SITE_URL ?? 'http://localhost:3001';
  const [owner, repo] = env.DEMO_REPO.split('/') as [string, string];
  const bot = env.TELEGRAM_BOT_USERNAME ?? 'TU_BOT';

  must(
    await db.from('factories').upsert({ id: SEED_IDS.agency, name: env.DEMO_AGENCY_NAME, assistant_name: assistantName(env.DEMO_AGENCY_NAME) }),
    'factories',
  );

  // An existing project only gets its site_url updated.
  const existing = must(await db.from('projects').select('id').eq('id', SEED_IDS.project).maybeSingle(), 'projects');
  if (existing) {
    must(await db.from('projects').update({ site_url: siteUrl }).eq('id', SEED_IDS.project), 'projects');
  } else {
    must(
      await db.from('projects').insert({
        id: SEED_IDS.project,
        factory_id: SEED_IDS.agency,
        name: 'Panadería Mabel',
        client_name: 'Mabel',
        repo_owner: owner,
        repo_name: repo,
        default_branch: 'main',
        mode: 'contenido',
        config_path: 'walt.config.json',
        site_url: siteUrl,
      }),
      'projects',
    );
  }

  must(
    await db
      .from('rules')
      .upsert(
        { project_id: SEED_IDS.project, version: 1, policies: DEFAULT_RULES.policies, limits: DEFAULT_RULES.limits, created_by: 'seed' },
        { onConflict: 'project_id,version', ignoreDuplicates: true },
      ),
    'rules',
  );

  const live = must(
    await db.from('content_versions').select('id').eq('project_id', SEED_IDS.project).eq('status', 'viva').maybeSingle(),
    'content_versions',
  );
  if (!live) {
    must(
      await db
        .from('content_versions')
        .insert({ project_id: SEED_IDS.project, status: 'viva', content: bakeryContent(), published_at: new Date().toISOString() }),
      'content_versions',
    );
  }

  const links: string[] = [];
  const soon = new Date(Date.now() + HOUR).toISOString();
  for (const inv of INVITES) {
    const rows = must(
      await db
        .from('invites')
        .select('token, uses, max_uses')
        .eq('project_id', SEED_IDS.project)
        .eq('role', inv.role)
        .eq('max_uses', inv.maxUses)
        .gt('expires_at', soon)
        .order('created_at', { ascending: false }),
      'invites',
    );
    let token = rows?.find((r) => r.uses < r.max_uses)?.token as string | undefined;
    if (!token) {
      token = inviteToken();
      must(
        await db.from('invites').insert({
          token,
          project_id: SEED_IDS.project,
          role: inv.role,
          max_uses: inv.maxUses,
          expires_at: new Date(Date.now() + inv.ttlMs).toISOString(),
        }),
        'invites',
      );
    }
    links.push(`${inv.label.padEnd(16)} https://t.me/${bot}?start=${token}`);
  }

  const has0003 = (await schemaStatus(db, env)).clients;
  const sampleSummary = has0003 ? await seedClients(db, env.DEMO_AGENCY_NAME) : null;

  console.log(`✅ Agencia ${env.DEMO_AGENCY_NAME} (${SEED_IDS.agency})`);
  console.log(`✅ Proyecto Panadería Mabel (${SEED_IDS.project}) → ${siteUrl}, repo ${env.DEMO_REPO}`);
  console.log('✅ Reglas v1 y versión viva inicial');
  if (sampleSummary) console.log(`✅ ${sampleSummary}`);
  else console.log('⏭️  Salteé los clientes: falta aplicar la migración 0003 (pnpm db:migrate --status).');
  console.log('\nInvitaciones:');
  for (const l of links) console.log(`  ${l}`);
  if (!env.TELEGRAM_BOT_USERNAME) console.log('\n(Falta TELEGRAM_BOT_USERNAME: reemplazá TU_BOT en los links.)');
});

/**
 * Bakery client (kept if it exists, so panel edits survive) linked to the seed project, and the sample
 * clients: their projects are deleted and rebuilt (cascade: contacts, requests, events, messages,
 * quotes, approvals) so dates stay in the current month. Sample projects have no agency contact and
 * their client contacts use fake negative chat ids, so the worker never messages anyone.
 */
async function seedClients(db: SupabaseClient, agencyName: string): Promise<string> {
  must(await db.from('clients').upsert({ ...MABEL_CLIENT, factory_id: SEED_IDS.agency }, { ignoreDuplicates: true }), 'clients');
  must(await db.from('projects').update({ client_id: MABEL_CLIENT.id }).eq('id', SEED_IDS.project).is('client_id', null), 'projects');

  const rows = buildSampleClientRows({ now: Date.now(), factoryId: SEED_IDS.agency, agencyName });
  must(await db.from('projects').delete().in('id', [...SAMPLE_PROJECT_IDS]), 'projects');
  must(await db.from('clients').upsert(rows.clients), 'clients');
  must(await db.from('projects').insert(rows.projects), 'projects');
  must(await db.from('contacts').insert(rows.contacts), 'contacts');
  must(await db.from('requests').insert(rows.requests.map((r) => ({ ...r, quote_id: null }))), 'requests');
  must(await db.from('quotes').insert(rows.quotes), 'quotes');
  for (const r of rows.requests.filter((x) => x.quote_id)) {
    must(await db.from('requests').update({ quote_id: r.quote_id, updated_at: r.updated_at }).eq('id', r.id), 'requests');
  }
  must(await db.from('events').insert(rows.events), 'events');
  must(await db.from('messages').insert(rows.messages), 'messages');
  must(await db.from('approvals').insert(rows.approvals), 'approvals');
  return `Clientes: ${MABEL_CLIENT.name} y ${rows.clients.length} de ejemplo (${rows.clients.map((c) => c.name).join(', ')}) con ${rows.requests.length} pedidos de ejemplo`;
}
