/**
 * Leaves the bakery project as new for a demo run: deletes requests, messages, commands and
 * versions, restores the fixture as the live version and rules v1. Keeps contacts and invites.
 * With GITHUB_MODE=real it also commits the fixture to content/site.json of DEMO_REPO if it differs,
 * so git history matches the live version again (skip with --keep-repo).
 * Usage: pnpm demo:reset [--project <id>] [--keep-repo]
 */
import { DEFAULT_RULES, loadEnv, redact, SEED_IDS, type DaleEnv } from '@dale/core';
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
    if (process.argv.includes('--keep-repo')) console.log('   El repo del sitio no se tocó (--keep-repo).');
    else console.log(`   ${await resetRepo(env)}`);
  } finally {
    await sql.end();
  }
});

/** Commits the fixture as content/site.json in DEMO_REPO when it differs. Returns a one-line status. */
async function resetRepo(env: DaleEnv): Promise<string> {
  if (env.GITHUB_MODE !== 'real' || !env.GITHUB_TOKEN) return 'Repo del sitio sin tocar: GITHUB_MODE no es real.';
  const url = `https://api.github.com/repos/${env.DEMO_REPO}/contents/content/site.json`;
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  try {
    const current = await fetch(url, { headers });
    if (!current.ok) throw new Error(`GET ${current.status}`);
    const { sha, content } = (await current.json()) as { sha: string; content: string };
    const wanted = bakeryContent();
    const now = JSON.parse(Buffer.from(content, 'base64').toString('utf8')) as unknown;
    if (JSON.stringify(now) === JSON.stringify(wanted)) return `Repo ${env.DEMO_REPO}: content/site.json ya estaba como el inicial.`;
    const put = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'dale: demo:reset vuelve al contenido inicial',
        content: Buffer.from(JSON.stringify(wanted, null, 2) + '\n').toString('base64'),
        sha,
      }),
    });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
    return `Repo ${env.DEMO_REPO}: commit con el contenido inicial.`;
  } catch (err) {
    return `⚠️  No pude reiniciar el repo del sitio: ${redact(err instanceof Error ? err.message : String(err), env.secrets)}`;
  }
}
