import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export interface ReadinessCheck {
  ok: boolean;
  detail?: string;
}

export interface HealthOptions {
  port: number;
  host?: string;
  /** Readiness checks by name (database, queue, telegram…). Each one gets `checkTimeoutMs`. */
  checks: Record<string, () => Promise<ReadinessCheck>>;
  /** Prometheus text for `/metrics`. */
  metrics?: () => Promise<string>;
  /** Extra routes, e.g. `POST /telegram` → the webhook handler. */
  routes?: Record<string, (req: IncomingMessage, res: ServerResponse) => void>;
  checkTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface HealthServer {
  server: Server;
  /** While shutting down readiness answers 503, so the platform stops routing here first. */
  setDraining(draining: boolean): void;
  close(): Promise<void>;
}

const started = Date.now();

async function timed(fn: () => Promise<ReadinessCheck>, ms: number): Promise<ReadinessCheck> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<ReadinessCheck>((r) => {
        timer = setTimeout(() => r({ ok: false, detail: `no respondió en ${ms} ms` }), ms);
      }),
    ]);
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The worker's HTTP server. `/healthz` is liveness (the process and its event loop answer: restart it if
 * not); `/readyz` is readiness (database reachable, queue running, not shutting down: send it traffic).
 * Answers JSON without secrets; error details are already redacted by whoever builds the checks.
 */
export async function startHealthServer(opts: HealthOptions): Promise<HealthServer> {
  let draining = false;
  const checkMs = opts.checkTimeoutMs ?? 3_000;
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
  };
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const route = opts.routes?.[`${req.method} ${path}`];
    if (route) return route(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end();
    if (path === '/healthz' || path === '/health') {
      return json(res, 200, { status: 'ok', uptime_s: Math.round((Date.now() - started) / 1000) });
    }
    if (path === '/readyz') {
      void (async () => {
        const entries = await Promise.all(Object.entries(opts.checks).map(async ([name, fn]) => [name, await timed(fn, checkMs)] as const));
        const checks = Object.fromEntries(entries);
        const ok = !draining && entries.every(([, c]) => c.ok);
        json(res, ok ? 200 : 503, { status: ok ? 'ready' : draining ? 'draining' : 'not_ready', checks });
      })().catch(() => json(res, 503, { status: 'not_ready' }));
      return;
    }
    if (path === '/metrics' && opts.metrics) {
      void opts
        .metrics()
        .then((text) => res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(text))
        .catch(() => res.writeHead(500).end());
      return;
    }
    res.writeHead(404).end();
  });
  server.keepAliveTimeout = 65_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  opts.log?.(`[health] escuchando en el puerto ${opts.port}: /healthz, /readyz${opts.metrics ? ', /metrics' : ''}`);
  return {
    server,
    setDraining(d) {
      draining = d;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Prometheus text format for a few gauges and counters. */
export function prometheus(metrics: { name: string; help: string; type: 'gauge' | 'counter'; values: { labels?: Record<string, string>; value: number }[] }[]): string {
  const out: string[] = [];
  for (const m of metrics) {
    out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`);
    for (const v of m.values) {
      const labels = v.labels && Object.keys(v.labels).length
        ? `{${Object.entries(v.labels).map(([k, val]) => `${k}="${val.replace(/["\\\n]/g, '_')}"`).join(',')}}`
        : '';
      out.push(`${m.name}${labels} ${Number.isFinite(v.value) ? v.value : 0}`);
    }
  }
  return `${out.join('\n')}\n`;
}
