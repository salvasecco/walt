/**
 * Leaves the bakery project as new for a demo run: deletes requests, messages, commands and
 * versions, restores the fixture as the live version and rules v1. Keeps contacts (except the
 * dry-run's console ones) and invites.
 * With GITHUB_MODE=real it also commits the fixture to content/site.json of DEMO_REPO if it differs,
 * so git history matches the live version again (skip with --keep-repo).
 * Usage: pnpm demo:reset [--project <id>] [--keep-repo]
 */
import { DEFAULT_RULES, loadEnv, redact, SEED_IDS, type DaleEnv } from '@dale/core';
import { bakeryContent } from '@dale/core/fixtures';
import { connect, must, runMain } from './lib/db.js';

runMain('demo:reset', async () => {
  const env = loadEnv();
  const i = process.argv.indexOf('--project');
  const project = i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : SEED_IDS.project;
  const db = connect(env);

  // No transactions over REST: deletes go child-first; events, approvals, quotes and commands cascade with requests.
  const requestIds = must(await db.from('requests').select('id').eq('project_id', project), 'requests')?.map((r) => r.id as string) ?? [];
  const contactIds = must(await db.from('contacts').select('id').eq('project_id', project), 'contacts')?.map((r) => r.id as string) ?? [];
  for (let k = 0; k < requestIds.length; k += 100) {
    must(await db.from('messages').delete().in('request_id', requestIds.slice(k, k + 100)), 'messages');
  }
  if (contactIds.length) must(await db.from('messages').delete().in('contact_id', contactIds), 'messages');
  // The dry-run's console contacts (chats 1 and 2) are not real chats: the worker would try to message them.
  must(await db.from('contacts').delete().eq('project_id', project).in('telegram_chat_id', [1, 2]), 'contacts');
  must(await db.from('requests').update({ draft_version_id: null, live_version_id: null, quote_id: null }).eq('project_id', project), 'requests');
  must(await db.from('requests').delete().eq('project_id', project), 'requests');
  must(await db.from('content_versions').delete().eq('project_id', project), 'content_versions');
  must(await db.from('rules').delete().eq('project_id', project), 'rules');
  must(
    await db
      .from('rules')
      .insert({ project_id: project, version: 1, policies: DEFAULT_RULES.policies, limits: DEFAULT_RULES.limits, created_by: 'demo:reset' }),
    'rules',
  );
  must(
    await db.from('content_versions').insert({ project_id: project, status: 'viva', content: bakeryContent(), published_at: new Date().toISOString() }),
    'content_versions',
  );

  console.log(`✅ Proyecto ${project} reiniciado: contenido del fixture, reglas v1, sin pedidos.`);
  if (process.argv.includes('--keep-repo')) console.log('   El repo del sitio no se tocó (--keep-repo).');
  else console.log(`   ${await resetRepo(env)}`);
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
