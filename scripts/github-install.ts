/**
 * Links an installation of Walt's GitHub App to an agency, until the panel's onboarding does it:
 *   pnpm github:install <factory_id> <installation_id>
 * Asks GitHub (with the App's JWT) whose installation it is, and saves it in github_installations.
 * Only for the operator: the agency must have installed the App on its own account (the panel will verify
 * that with the user's GitHub login). Needs GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY, and migration 0004.
 */
import { githubAppJwt, parsePrivateKey } from '../packages/agent/src/hosts.ts';
import { loadEnv } from '@walt/core';
import { loadExtraEnv } from '../apps/worker/src/extra-env.ts';
import { connect, must, runMain } from './lib/db.js';

runMain('github:install', async () => {
  const [factory, installation] = process.argv.slice(2).filter((a) => a !== '--');
  const installationId = Number(installation);
  if (!factory || !Number.isInteger(installationId) || installationId <= 0) throw new Error('Uso: pnpm github:install <factory_id> <installation_id>');
  const extra = loadExtraEnv();
  if (!extra.githubApp) throw new Error('Faltan GITHUB_APP_ID y GITHUB_APP_PRIVATE_KEY en ~/.walt/.env');
  const db = connect(loadEnv());
  const f = must(await db.from('factories').select('name').eq('id', factory).maybeSingle(), 'factories') as { name: string } | null;
  if (!f) throw new Error(`No existe la agencia ${factory}`);

  const jwt = githubAppJwt(extra.githubApp.appId, parsePrivateKey(extra.githubApp.privateKey));
  const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'walt-agent' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 200) throw new Error(`GitHub no reconoce la instalación ${installationId} de la App (HTTP ${res.status})`);
  const data = (await res.json()) as { account?: { login?: string; type?: string }; suspended_at?: string | null };
  const login = data.account?.login;
  if (!login) throw new Error('La instalación no dice de qué cuenta es');
  const type = data.account?.type === 'Organization' || data.account?.type === 'User' ? data.account.type : null;

  const existing = must(await db.from('github_installations').select('factory_id').eq('installation_id', installationId).maybeSingle(), 'github_installations') as
    | { factory_id: string }
    | null;
  if (existing && existing.factory_id !== factory) throw new Error('Esa instalación ya está vinculada a otra agencia');
  const row = { factory_id: factory, installation_id: installationId, account_login: login, account_type: type, suspended_at: data.suspended_at ?? null };
  if (existing) must(await db.from('github_installations').update(row).eq('installation_id', installationId), 'github_installations');
  else must(await db.from('github_installations').insert(row), 'github_installations');
  console.log(`✅ ${f.name}: la App queda instalada en ${login}${type ? ` (${type})` : ''}. Los repos de ${login} usan su token de instalación; el resto, GITHUB_TOKEN.`);
});
