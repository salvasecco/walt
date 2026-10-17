/**
 * Real test of the code lane against DEMO_REPO (SPEC §11): needs LLM_PROVIDER=anthropic|bedrock
 * with its key, GITHUB_MODE=real and GITHUB_TOKEN. Opens a PR, waits for the Vercel preview,
 * prints both and, with `--close`, closes the PR and deletes the branch (main is never touched).
 *
 *   pnpm --filter @dale/agent smoke -- --close ["instrucción"]
 */
import { Octokit } from '@octokit/rest';
import { loadEnv, missingCredentials, redact, shortId } from '@dale/core';
import { createAgentDeps, runCodeChange } from './index.js';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const close = args.includes('--close');
  const instruction =
    args.filter((a) => !a.startsWith('--')).join(' ').trim() ||
    'Agregar un aviso de envío gratis arriba del footer del sitio: una franja angosta con el texto "Envío gratis en compras de más de $1000", con los colores del tema. Solo ese cambio visual.';
  const env = loadEnv();
  const missing = missingCredentials(env).filter((m) => m.mode === 'LLM_PROVIDER' || m.mode === 'GITHUB_MODE');
  if (env.LLM_PROVIDER === 'fake' || env.GITHUB_MODE !== 'real' || missing.length > 0) {
    console.error('[smoke] Hace falta LLM_PROVIDER=anthropic|bedrock con su clave, GITHUB_MODE=real y GITHUB_TOKEN.');
    for (const m of missing) console.error(`[smoke] falta: ${m.keys.join(', ')}`);
    process.exit(2);
  }
  const [owner, name] = env.DEMO_REPO.split('/') as [string, string];
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const { data: r } = await octokit.rest.repos.get({ owner, repo: name });
  const repo = { owner, name, defaultBranch: r.default_branch };
  const id = shortId();
  const t0 = Date.now();
  console.log(`[smoke] ${owner}/${name}@${repo.defaultBranch}, pedido #${id}`);
  const res = await runCodeChange({ repo, requestId: `smoke-${id}`, shortId: id, instruction }, createAgentDeps(env));
  for (const l of res.logs) console.log(`  · ${l}`);
  console.log(`[smoke] PR: ${res.prUrl}`);
  console.log(`[smoke] archivos: ${res.changedFiles.join(', ')}`);
  console.log(`[smoke] vista previa: ${res.previewUrl ?? 'no apareció en 4 minutos'}`);
  console.log(`[smoke] ${Math.round((Date.now() - t0) / 1000)} s`);
  if (close) {
    await octokit.rest.pulls.update({ owner, repo: name, pull_number: res.prNumber, state: 'closed' });
    await octokit.rest.git.deleteRef({ owner, repo: name, ref: `heads/${res.branch}` });
    console.log(`[smoke] PR #${res.prNumber} cerrado y rama ${res.branch} borrada`);
  }
}

main().catch((err) => {
  const env = (() => {
    try {
      return loadEnv();
    } catch {
      return undefined;
    }
  })();
  console.error(`[smoke] ${redact(err instanceof Error ? err.message : String(err), env?.secrets ?? [])}`);
  process.exit(1);
});
