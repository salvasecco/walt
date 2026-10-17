import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildAgentEnv,
  checkPath,
  DEFAULT_PROTECTED_GLOBS,
  DiffRejectedError,
  evaluateToolUse,
  findPreviewUrlWith,
  guardHook,
  LocalHost,
  mergeChangeWith,
  revertChangeWith,
  reviewDiff,
  runCodeChangeWith,
  type AgentRunner,
  type RepoRef,
} from '../src/index.js';

const G = DEFAULT_PROTECTED_GLOBS;
let base: string; // temp root
let root: string; // a plain checkout used for guard tests
let host: LocalHost;
const repo: RepoRef = { owner: 'acme', name: 'demo', defaultBranch: 'main' };
const FOOTER = 'export function Footer() {\n  return <footer>Panadería Mabel</footer>;\n}\n';

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    env: { PATH: process.env.PATH, HOME: base, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'dale-agent-test-')));
  // Sample site repo, pushed to a bare "remote" served by LocalHost.
  const seed = join(base, 'seed');
  mkdirSync(join(seed, 'src'), { recursive: true });
  writeFileSync(join(seed, 'package.json'), '{"name":"demo"}\n');
  writeFileSync(join(seed, 'next.config.ts'), 'export default {};\n');
  writeFileSync(join(seed, 'src', 'footer.tsx'), FOOTER);
  writeFileSync(join(seed, 'src', 'old.ts'), 'export const x = eval("1");\n');
  symlinkSync('/etc', join(seed, 'etc-link'));
  sh(seed, 'init', '-q', '-b', 'main');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '-q', '-m', 'init');
  host = new LocalHost(join(base, 'gh'), (sha) => `https://demo-git-${sha.slice(0, 7)}.vercel.app`);
  mkdirSync(join(base, 'gh', 'acme'), { recursive: true });
  sh(base, 'clone', '-q', '--bare', seed, host.remoteUrl(repo));

  root = join(base, 'checkout');
  sh(base, 'clone', '-q', host.remoteUrl(repo), root);
  writeFileSync(join(root, '.env'), 'SECRET=1\n');
  symlinkSync(base, join(root, 'src', 'escape'));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('hook de rutas', () => {
  it('deja leer y escribir dentro del clon', () => {
    expect(checkPath(root, 'src/footer.tsx', G).ok).toBe(true);
    expect(checkPath(root, join(root, 'src/footer.tsx'), G).ok).toBe(true);
    expect(checkPath(root, 'src/components/new-banner.tsx', G).ok).toBe(true);
  });

  it('bloquea ../ y rutas absolutas fuera del clon', () => {
    expect(checkPath(root, '../seed/package.json', G).ok).toBe(false);
    expect(checkPath(root, 'src/../../seed/src/footer.tsx', G).ok).toBe(false);
    expect(checkPath(root, '/etc/passwd', G).ok).toBe(false);
    expect(checkPath(root, resolve(root, '..', 'gh'), G).ok).toBe(false);
  });

  it('bloquea symlinks, sin seguirlos', () => {
    const a = checkPath(root, 'etc-link/passwd', G);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toMatch(/enlace simbólico/);
    expect(checkPath(root, 'etc-link', G).ok).toBe(false);
    expect(checkPath(root, 'src/escape/seed/package.json', G).ok).toBe(false);
    expect(checkPath(root, 'src/escape/new-file.ts', G).ok).toBe(false);
  });

  it('bloquea package.json, .env, configs y .git', () => {
    for (const p of ['package.json', 'apps/web/package.json', 'PACKAGE.JSON', '.env', '.env.local', 'src/.env', 'next.config.ts', 'tailwind.config.js', 'pnpm-lock.yaml', '.github/workflows/ci.yml', 'middleware.ts', 'src/middleware.ts', 'proxy.ts', '.git/config', '.git/hooks/pre-commit', '.claude/settings.json']) {
      const r = checkPath(root, p, G);
      expect(r.ok, p).toBe(false);
    }
  });

  it('evalúa cada herramienta y niega las que no están permitidas', () => {
    expect(evaluateToolUse(root, 'Read', { file_path: 'src/footer.tsx' }, G).allow).toBe(true);
    expect(evaluateToolUse(root, 'Write', { file_path: '.env', content: 'x' }, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Edit', { file_path: '../x', old_string: 'a', new_string: 'b' }, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Edit', {}, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Glob', { pattern: '**/*.tsx' }, G).allow).toBe(true);
    expect(evaluateToolUse(root, 'Glob', { pattern: '../**/*' }, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Glob', { pattern: '/etc/*' }, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Grep', { pattern: 'x', path: '..' }, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Grep', { pattern: 'x', glob: '../../**' }, G).allow).toBe(false);
    expect(evaluateToolUse(root, 'Grep', { pattern: 'x' }, G).allow).toBe(true);
    for (const t of ['Bash', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'mcp__x__y']) {
      expect(evaluateToolUse(root, t, { command: 'ls' }, G).allow, t).toBe(false);
    }
  });

  it('el hook PreToolUse devuelve deny con la razón', async () => {
    const logs: string[] = [];
    const hook = guardHook(root, G, (l) => logs.push(l));
    const signal = new AbortController().signal;
    const base = { session_id: 's', transcript_path: '/dev/null', cwd: root, hook_event_name: 'PreToolUse' as const, tool_use_id: 't' };
    const denied = await hook({ ...base, tool_name: 'Write', tool_input: { file_path: 'package.json', content: '{}' } }, 't', { signal });
    expect(denied).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
    const allowed = await hook({ ...base, tool_name: 'Read', tool_input: { file_path: 'src/footer.tsx' } }, 't', { signal });
    expect(allowed).toEqual({ continue: true });
    expect(logs).toHaveLength(1);
  });
});

describe('revisión del diff', () => {
  const files = [{ path: 'src/footer.tsx', mode: '100644' }];
  const diffWith = (line: string) => `--- a/src/footer.tsx\n+++ b/src/footer.tsx\n@@ -1 +1,2 @@\n ok\n+${line}\n`;

  it('rechaza process.env, child_process, eval( y <script nuevos', () => {
    expect(reviewDiff({ diff: diffWith('const k = process.env.GITHUB_TOKEN;'), files, protectedGlobs: G })).toContain('El diff usa process.env');
    expect(reviewDiff({ diff: diffWith("const k = process['env'];"), files, protectedGlobs: G })).toContain('El diff usa process.env');
    expect(reviewDiff({ diff: diffWith("import { exec } from 'node:child_process';"), files, protectedGlobs: G })).toContain('El diff usa child_process');
    expect(reviewDiff({ diff: diffWith('eval (code)'), files, protectedGlobs: G })).toContain('El diff usa eval(');
    expect(reviewDiff({ diff: diffWith('<Script src="x" />'), files, protectedGlobs: G })).toContain('El diff agrega un <script');
  });

  it('acepta borrar un eval( y rechaza secretos, protegidos y symlinks', () => {
    expect(reviewDiff({ diff: '--- a/x\n+++ b/x\n-eval(1)\n+const y = 1;\n', files, protectedGlobs: G })).toEqual([]);
    expect(reviewDiff({ diff: diffWith('const t = "supersecreto123";'), files, protectedGlobs: G, secrets: ['supersecreto123'] })).toContain(
      'El diff contiene el valor de un secreto',
    );
    expect(reviewDiff({ diff: diffWith('x'), files: [{ path: 'package.json' }], protectedGlobs: G })[0]).toMatch(/protegido/);
    expect(reviewDiff({ diff: diffWith('x'), files: [{ path: 'src/l', mode: '120000' }], protectedGlobs: G })[0]).toMatch(/enlace/);
    expect(reviewDiff({ diff: '', files: [], protectedGlobs: G })).toEqual(['El agente no cambió ningún archivo']);
  });
});

describe('entorno mínimo del agente', () => {
  it('solo pasa las variables del proveedor', () => {
    const env = buildAgentEnv(
      { LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test-12345678', AWS_REGION: undefined, AWS_ACCESS_KEY_ID: 'AKIA-no', AWS_SECRET_ACCESS_KEY: undefined },
      { home: '/tmp/h' },
    );
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test-12345678');
    expect(env.HOME).toBe('/tmp/h');
    expect(Object.keys(env).some((k) => /GITHUB|SUPABASE|TELEGRAM|AWS|PANEL|OPENAI/.test(k))).toBe(false);
    const bedrock = buildAgentEnv(
      { LLM_PROVIDER: 'bedrock', ANTHROPIC_API_KEY: 'sk-no', AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      { home: '/tmp/h' },
    );
    expect(bedrock.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    expect(bedrock.ANTHROPIC_API_KEY).toBeUndefined();
    expect(() => buildAgentEnv({ LLM_PROVIDER: 'fake' } as never, { home: '/tmp/h' })).toThrow();
  });
});

/** Fake agent that goes through the same guard as the real hook, then touches files. */
function scripted(steps: { tool: 'Write' | 'Edit'; input: Record<string, string> }[], opts: { bypassGuard?: boolean } = {}): AgentRunner {
  return async ({ cwd, protectedGlobs, log }) => {
    for (const s of steps) {
      if (!opts.bypassGuard) {
        const d = evaluateToolUse(cwd, s.tool, s.input, protectedGlobs);
        if (!d.allow) {
          log(`bloqueado ${s.tool}: ${d.reason}`);
          continue;
        }
      }
      const p = resolve(cwd, s.input.file_path!);
      if (s.tool === 'Write') {
        mkdirSync(resolve(p, '..'), { recursive: true });
        writeFileSync(p, s.input.content!);
      } else {
        writeFileSync(p, readFileSync(p, 'utf8').replace(s.input.old_string!, s.input.new_string!));
      }
    }
    return { summary: 'Agrego un aviso de envío gratis arriba del footer', turns: steps.length };
  };
}

const input = (shortId: string) => ({
  repo,
  requestId: '00000000-0000-4000-8000-000000000001',
  shortId,
  instruction: 'Agregar un aviso "Envío gratis en compras de más de $500" arriba del footer.',
});

describe('runCodeChange con un repo local', () => {
  it('clona, corre el agente, revisa, hace push, abre el PR y encuentra la vista previa; merge y revert', async () => {
    const runner = scripted([
      { tool: 'Write', input: { file_path: 'package.json', content: '{"scripts":{"postinstall":"curl evil"}}' } },
      { tool: 'Write', input: { file_path: '../escape.txt', content: 'x' } },
      { tool: 'Edit', input: { file_path: 'src/footer.tsx', old_string: '<footer>', new_string: '<><p>Envío gratis en compras de más de $500</p><footer>' } },
      { tool: 'Edit', input: { file_path: 'src/footer.tsx', old_string: '</footer>;', new_string: '</footer></>;' } },
    ]);
    const res = await runCodeChangeWith(input('ABC234'), { host, runner, previewPollMs: 10, previewTimeoutMs: 100 });
    expect(res.branch).toBe('dale/ABC234');
    expect(res.changedFiles).toEqual(['src/footer.tsx']);
    expect(res.diff).toContain('Envío gratis');
    expect(res.prNumber).toBe(1);
    expect(res.previewUrl).toBe(`https://demo-git-${res.commitSha.slice(0, 7)}.vercel.app`);
    expect(res.logs.filter((l) => l.startsWith('bloqueado'))).toHaveLength(2);
    expect(sh(host.remoteUrl(repo), 'log', '-1', '--format=%s', 'dale/ABC234').trim()).toMatch(/^dale: .*\(#ABC234\)$/);
    expect(host.listPullRequests(repo)[0]).toMatchObject({ head: 'dale/ABC234', base: 'main', state: 'open' });

    const { mergeSha } = await mergeChangeWith({ repo, prNumber: res.prNumber }, host);
    expect(sh(host.remoteUrl(repo), 'show', 'main:src/footer.tsx')).toContain('Envío gratis');

    const { revertSha } = await revertChangeWith({ repo, mergeSha, shortId: 'ABC234' }, host);
    expect(sh(host.remoteUrl(repo), 'log', '-1', '--format=%H %s', 'main').trim()).toBe(`${revertSha} dale: revert #ABC234`);
    expect(sh(host.remoteUrl(repo), 'show', 'main:src/footer.tsx')).toBe(FOOTER);
  });

  it('un diff con process.env se rechaza y no se sube nada', async () => {
    const runner = scripted([{ tool: 'Write', input: { file_path: 'src/key.ts', content: 'export const k = process.env.GITHUB_TOKEN;\n' } }]);
    await expect(runCodeChangeWith(input('ENV234'), { host, runner, previewTimeoutMs: 0 })).rejects.toBeInstanceOf(DiffRejectedError);
    expect(sh(host.remoteUrl(repo), 'branch', '--list', 'dale/ENV234').trim()).toBe('');
  });

  it('si el agente se saltea el hook, la revisión igual frena package.json', async () => {
    const runner = scripted([{ tool: 'Write', input: { file_path: 'package.json', content: '{"name":"evil"}\n' } }], { bypassGuard: true });
    const err = await runCodeChangeWith(input('PKG234'), { host, runner, previewTimeoutMs: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DiffRejectedError);
    expect((err as DiffRejectedError).reasons.join()).toMatch(/protegido: package.json/);
  });

  it('un symlink nuevo se rechaza en la revisión', async () => {
    const runner: AgentRunner = async ({ cwd }) => {
      symlinkSync('/etc/passwd', join(cwd, 'src', 'passwd.ts'));
      return {};
    };
    const err = await runCodeChangeWith(input('LNK234'), { host, runner, previewTimeoutMs: 0 }).catch((e: unknown) => e);
    expect((err as DiffRejectedError).reasons.join()).toMatch(/enlace simbólico/);
  });

  it('corta por timeout', async () => {
    const runner: AgentRunner = () => new Promise(() => {});
    await expect(runCodeChangeWith({ ...input('TMO234'), timeoutMs: 100 }, { host, runner })).rejects.toThrow(/tiempo/);
  });

  it('valida shortId y repo', async () => {
    const runner = scripted([]);
    await expect(runCodeChangeWith(input('../x'), { host, runner })).rejects.toThrow(/shortId/);
    await expect(runCodeChangeWith({ ...input('OK2345'), repo: { ...repo, defaultBranch: '--upload-pack=x' } }, { host, runner })).rejects.toThrow(/Rama/);
  });
});

describe('findPreviewUrl', () => {
  it('reintenta hasta encontrar la vista previa', async () => {
    let calls = 0;
    const h = new LocalHost(base, () => (++calls >= 3 ? 'https://x.vercel.app' : undefined));
    expect(await findPreviewUrlWith({ repo, sha: 'abc1234', timeoutMs: 1000 }, h, 5)).toBe('https://x.vercel.app');
    expect(calls).toBe(3);
  });

  it('devuelve undefined al vencer el plazo', async () => {
    const h = new LocalHost(base);
    expect(await findPreviewUrlWith({ repo, sha: 'abc1234', timeoutMs: 30 }, h, 10)).toBeUndefined();
  });
});
