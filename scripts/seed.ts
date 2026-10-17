/**
 * Idempotent seed with the fixed ids of SPEC §5: agency, bakery project, rules v1,
 * initial live version from the fixture, and three invites (client, agency, jury).
 * Goes through supabase-js with the service role (HTTPS only).
 * Usage: pnpm seed
 */
import { assistantName, DEFAULT_RULES, inviteToken, loadEnv, SEED_IDS, type Role } from '@dale/core';
import { bakeryContent } from '@dale/core/fixtures';
import { connect, must, runMain } from './lib/db.js';

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
        config_path: 'dale.config.json',
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

  console.log(`✅ Agencia ${env.DEMO_AGENCY_NAME} (${SEED_IDS.agency})`);
  console.log(`✅ Proyecto Panadería Mabel (${SEED_IDS.project}) → ${siteUrl}, repo ${env.DEMO_REPO}`);
  console.log('✅ Reglas v1 y versión viva inicial');
  console.log('\nInvitaciones:');
  for (const l of links) console.log(`  ${l}`);
  if (!env.TELEGRAM_BOT_USERNAME) console.log('\n(Falta TELEGRAM_BOT_USERNAME: reemplazá TU_BOT en los links.)');
});
