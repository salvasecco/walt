/**
 * Leaves the bakery project as new for a demo run: deletes requests, messages, commands and
 * versions, restores the fixture as the live version and rules v1. Keeps contacts and invites.
 * Usage: pnpm demo:reset [--project <id>]
 */
import { DEFAULT_RULES, loadEnv, SEED_IDS } from '@dale/core';
import { bakeryContent } from '@dale/core/fixtures';
import { connect, runMain } from './lib/db.js';

runMain('demo:reset', async () => {
  const env = loadEnv();
  const i = process.argv.indexOf('--project');
  const project = i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : SEED_IDS.project;
  const sql = connect(env);
  try {
    await sql.begin(async (tx) => {
      await tx`delete from commands where request_id in (select id from requests where project_id = ${project})`;
      await tx`delete from messages where request_id in (select id from requests where project_id = ${project})
                 or contact_id in (select id from contacts where project_id = ${project})`;
      await tx`update requests set draft_version_id = null, live_version_id = null, quote_id = null where project_id = ${project}`;
      await tx`delete from requests where project_id = ${project}`;
      await tx`delete from content_versions where project_id = ${project}`;
      await tx`delete from rules where project_id = ${project}`;
      await tx`
        insert into rules (project_id, version, policies, limits, created_by)
        values (${project}, 1, ${tx.json(DEFAULT_RULES.policies)}, ${tx.json(DEFAULT_RULES.limits)}, 'demo:reset')`;
      await tx`
        insert into content_versions (project_id, status, content, published_at)
        values (${project}, 'viva', ${tx.json(bakeryContent() as never)}, now())`;
    });
    console.log(`✅ Proyecto ${project} reiniciado: contenido del fixture, reglas v1, sin pedidos.`);
    console.log('   El repo del sitio no se toca: si hace falta, revertí sus commits a mano.');
  } finally {
    await sql.end();
  }
});
