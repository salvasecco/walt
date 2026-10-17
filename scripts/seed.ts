/**
 * Idempotent seed with the fixed ids of SPEC §5: agency, bakery project, rules v1,
 * initial live version from the fixture, and three invites (client, agency, jury).
 * Usage: pnpm seed
 */
import { assistantName, DEFAULT_RULES, inviteToken, loadEnv, SEED_IDS, type Role } from '@dale/core';
import { bakeryContent } from '@dale/core/fixtures';
import { connect, runMain } from './lib/db.js';

const HOUR = 3600_000;
const INVITES: { label: string; role: Role; maxUses: number; ttlMs: number }[] = [
  { label: 'Cliente (Mabel)', role: 'cliente', maxUses: 5, ttlMs: 7 * 24 * HOUR },
  { label: 'Agencia', role: 'agencia', maxUses: 5, ttlMs: 7 * 24 * HOUR },
  { label: 'Jurado', role: 'cliente', maxUses: 50, ttlMs: 48 * HOUR },
];

runMain('seed', async () => {
  const env = loadEnv();
  const sql = connect(env);
  const siteUrl = env.DEMO_SITE_URL ?? 'http://localhost:3001';
  const [owner, repo] = env.DEMO_REPO.split('/') as [string, string];
  const bot = env.TELEGRAM_BOT_USERNAME ?? 'TU_BOT';
  try {
    const links = await sql.begin(async (tx) => {
      await tx`
        insert into factories (id, name, assistant_name)
        values (${SEED_IDS.agency}, ${env.DEMO_AGENCY_NAME}, ${assistantName(env.DEMO_AGENCY_NAME)})
        on conflict (id) do update set name = excluded.name, assistant_name = excluded.assistant_name`;

      await tx`
        insert into projects (id, factory_id, name, client_name, repo_owner, repo_name, default_branch, mode, config_path, site_url)
        values (${SEED_IDS.project}, ${SEED_IDS.agency}, 'Panadería Mabel', 'Mabel', ${owner}, ${repo}, 'main', 'contenido', 'dale.config.json', ${siteUrl})
        on conflict (id) do update set site_url = excluded.site_url`;

      await tx`
        insert into rules (project_id, version, policies, limits, created_by)
        values (${SEED_IDS.project}, 1, ${tx.json(DEFAULT_RULES.policies)}, ${tx.json(DEFAULT_RULES.limits)}, 'seed')
        on conflict (project_id, version) do nothing`;

      const [live] = await tx`select id from content_versions where project_id = ${SEED_IDS.project} and status = 'viva'`;
      if (!live) {
        await tx`
          insert into content_versions (project_id, status, content, published_at)
          values (${SEED_IDS.project}, 'viva', ${tx.json(bakeryContent() as never)}, now())`;
      }

      const out: string[] = [];
      for (const inv of INVITES) {
        const [existing] = await tx<{ token: string }[]>`
          select token from invites
          where project_id = ${SEED_IDS.project} and role = ${inv.role} and max_uses = ${inv.maxUses}
            and uses < max_uses and expires_at > now() + interval '1 hour'
          order by created_at desc limit 1`;
        let token = existing?.token;
        if (!token) {
          token = inviteToken();
          await tx`
            insert into invites (token, project_id, role, max_uses, expires_at)
            values (${token}, ${SEED_IDS.project}, ${inv.role}, ${inv.maxUses}, ${new Date(Date.now() + inv.ttlMs)})`;
        }
        out.push(`${inv.label.padEnd(16)} https://t.me/${bot}?start=${token}`);
      }
      return out;
    });

    console.log(`✅ Agencia ${env.DEMO_AGENCY_NAME} (${SEED_IDS.agency})`);
    console.log(`✅ Proyecto Panadería Mabel (${SEED_IDS.project}) → ${siteUrl}, repo ${env.DEMO_REPO}`);
    console.log('✅ Reglas v1 y versión viva inicial');
    console.log('\nInvitaciones:');
    for (const l of links) console.log(`  ${l}`);
    if (!env.TELEGRAM_BOT_USERNAME) console.log('\n(Falta TELEGRAM_BOT_USERNAME: reemplazá TU_BOT en los links.)');
  } finally {
    await sql.end();
  }
});
