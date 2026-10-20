import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GitHubAccessError, GitHubAppTokens, githubAppJwt, githubTokenSource, parsePrivateKey } from '../src/hosts.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function fakeGitHub() {
  const calls: { url: string; auth: string; body: unknown }[] = [];
  let n = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), auth: headers.get('authorization') ?? '', body: JSON.parse(String(init?.body ?? 'null')) });
    n++;
    return new Response(JSON.stringify({ token: `ghs_token_${n}`, expires_at: new Date(Date.now() + 3600_000).toISOString() }), { status: 201 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('GitHub App', () => {
  it('firma el JWT de la App con RS256 (iat 60 s atrás, 9 minutos)', () => {
    const jwt = githubAppJwt('12345', parsePrivateKey(PEM), 1_000_000);
    const [h, p, sig] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({ iat: 999_940, exp: 1_000_540, iss: '12345' });
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey(privateKey), Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('acepta la clave con \\n escapados o en base64', () => {
    expect(() => parsePrivateKey(PEM.replace(/\n/g, '\\n'))).not.toThrow();
    expect(() => parsePrivateKey(Buffer.from(PEM).toString('base64'))).not.toThrow();
  });

  it('pide el token de instalación con permisos mínimos y lo guarda hasta que esté por vencer', async () => {
    const gh = fakeGitHub();
    const tokens = new GitHubAppTokens({ appId: '1', privateKey: PEM }, gh.fetchImpl);
    const a = await tokens.token(77);
    const b = await tokens.token(77);
    expect(a.token).toBe('ghs_token_1');
    expect(b.token).toBe('ghs_token_1');
    expect(gh.calls).toHaveLength(1);
    expect(gh.calls[0]!.url).toBe('https://api.github.com/app/installations/77/access_tokens');
    expect(gh.calls[0]!.auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(gh.calls[0]!.body).toEqual({ permissions: { contents: 'write', pull_requests: 'write', statuses: 'read', deployments: 'read', metadata: 'read' } });
  });

  it('usa la instalación de la agencia y si no, GITHUB_TOKEN', async () => {
    const gh = fakeGitHub();
    const seen: string[] = [];
    const source = githubTokenSource({
      app: { appId: '1', privateKey: PEM },
      fallbackToken: 'ghp_respaldo',
      findInstallation: async (factoryId, owner) => (factoryId === 'f1' && owner.toLowerCase() === 'faro' ? { installation_id: 9 } : null),
      onToken: (t) => seen.push(t),
      fetchImpl: gh.fetchImpl,
    });
    expect(await source.tokenFor({ factoryId: 'f1', owner: 'Faro' })).toEqual({ token: 'ghs_token_1', source: 'app', installationId: 9 });
    expect(await source.tokenFor({ factoryId: 'f2', owner: 'Faro' })).toEqual({ token: 'ghp_respaldo', source: 'token' });
    expect(await source.tokenFor({ factoryId: null, owner: 'Faro' })).toEqual({ token: 'ghp_respaldo', source: 'token' });
    expect(seen).toEqual(['ghs_token_1']);
    const none = githubTokenSource({ findInstallation: async () => null });
    await expect(none.tokenFor({ factoryId: 'f1', owner: 'x' })).rejects.toThrow(/instalar la GitHub App/);
  });

  it('GITHUB_TOKEN solo para las agencias de la instancia: las demás necesitan su instalación', async () => {
    const gh = fakeGitHub();
    const source = githubTokenSource({
      app: { appId: '1', privateKey: PEM },
      fallbackToken: 'ghp_de_la_instancia',
      fallbackFactories: ['seed'],
      findInstallation: async (factoryId, owner) => (factoryId === 'agencia' && owner === 'suya' ? { installation_id: 3 } : null),
      fetchImpl: gh.fetchImpl,
    });
    expect(await source.tokenFor({ factoryId: 'seed', owner: 'salvasecco' })).toEqual({ token: 'ghp_de_la_instancia', source: 'token' });
    expect((await source.tokenFor({ factoryId: 'agencia', owner: 'suya' })).source).toBe('app');
    await expect(source.tokenFor({ factoryId: 'agencia', owner: 'ajena' })).rejects.toBeInstanceOf(GitHubAccessError);
    await expect(source.tokenFor({ factoryId: null, owner: 'salvasecco' })).rejects.toThrow(/GitHub App de Walt no está instalada en salvasecco/);
    // Without the App configured at all, the rule still holds.
    const noApp = githubTokenSource({ fallbackToken: 'ghp_de_la_instancia', fallbackFactories: ['seed'], findInstallation: async () => null });
    await expect(noApp.tokenFor({ factoryId: 'agencia', owner: 'ajena' })).rejects.toBeInstanceOf(GitHubAccessError);
    expect(gh.calls).toHaveLength(1);
  });

  it('un error de GitHub no muestra el JWT', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as typeof fetch;
    const tokens = new GitHubAppTokens({ appId: '1', privateKey: PEM }, fetchImpl);
    await expect(tokens.token(5)).rejects.toThrow('GitHub no dio un token para la instalación 5: HTTP 401 Bad credentials');
  });
});
