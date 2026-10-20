import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { runWithWork } from '../src/context.js';
import { prometheus, startHealthServer } from '../src/health.js';
import { createLogger } from '../src/log.js';
import { TimeoutError } from '../src/queue.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  errorStatus,
  guardScreenshots,
  isTransient,
  retryAfterMs,
  retrying,
} from '../src/resilience.js';

const httpError = (status: number, headers: Record<string, string> = {}) => Object.assign(new Error(`HTTP ${status}`), { status, headers });

describe('clasificación de errores', () => {
  it('reconoce status de fetch, del SDK, de octokit y de grammY', () => {
    expect(errorStatus(httpError(429))).toBe(429);
    expect(errorStatus({ response: { status: 502 } })).toBe(502);
    expect(errorStatus({ error_code: 429 })).toBe(429);
  });
  it('lee Retry-After en segundos o fecha, el reset de GitHub y el retry_after de Telegram', () => {
    expect(retryAfterMs(httpError(429, { 'retry-after': '3' }))).toBe(3000);
    expect(retryAfterMs(httpError(503, { 'retry-after': new Date(10_000).toUTCString() }), 4_000)).toBe(6000);
    expect(retryAfterMs({ response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '20' } } }, 10_000)).toBe(10_000);
    expect(retryAfterMs({ parameters: { retry_after: 7 } })).toBe(7000);
    expect(retryAfterMs({ headers: new Headers({ 'retry-after': '2' }) })).toBe(2000);
  });
  it('lo transitorio se reintenta; un 400 o un 404 no', () => {
    expect(isTransient(httpError(429))).toBe(true);
    expect(isTransient(httpError(529))).toBe(true);
    expect(isTransient(httpError(500))).toBe(true);
    expect(isTransient(new TimeoutError('x', 1))).toBe(true);
    expect(isTransient(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isTransient(httpError(403, { 'retry-after': '60' }))).toBe(true);
    expect(isTransient(httpError(400))).toBe(false);
    expect(isTransient(httpError(404))).toBe(false);
    expect(isTransient(new Error('El modelo devolvió algo inválido'))).toBe(false);
  });
});

describe('reintentos', () => {
  it('espera lo que pide el proveedor en un 429 y después reintenta', async () => {
    const waits: number[] = [];
    let calls = 0;
    const r = await retrying(
      async () => {
        calls++;
        if (calls === 1) throw httpError(429, { 'retry-after': '4' });
        return 'ok';
      },
      { retries: 2, sleep: async (ms) => void waits.push(ms) },
    );
    expect(r).toBe('ok');
    expect(waits).toEqual([4000]);
  });
  it('no reintenta un error permanente ni espera un Retry-After demasiado largo', async () => {
    let calls = 0;
    await expect(retrying(async () => (calls++, Promise.reject(httpError(400))), { retries: 3, sleep: async () => {} })).rejects.toThrow('HTTP 400');
    expect(calls).toBe(1);
    await expect(retrying(async () => Promise.reject(httpError(429, { 'retry-after': '3600' })), { retries: 3, sleep: async () => {} })).rejects.toThrow('HTTP 429');
  });
  it('backoff exponencial con jitter', async () => {
    const waits: number[] = [];
    await expect(retrying(async () => Promise.reject(httpError(503)), { retries: 3, baseMs: 100, sleep: async (ms) => void waits.push(ms) })).rejects.toThrow();
    expect(waits).toHaveLength(3);
    expect(waits[0]).toBeGreaterThanOrEqual(75);
    expect(waits[0]).toBeLessThanOrEqual(125);
    expect(waits[2]).toBeGreaterThanOrEqual(300);
    expect(waits[2]).toBeLessThanOrEqual(500);
  });
});

describe('circuit breaker', () => {
  it('se abre tras fallas de infraestructura seguidas, prueba una llamada y se cierra', async () => {
    let t = 0;
    const states: string[] = [];
    const b = new CircuitBreaker('modelo', { failureThreshold: 2, cooldownMs: 1000, now: () => t, onChange: (s) => states.push(s) });
    const fail = () => b.run(() => Promise.reject(httpError(503)));
    await expect(fail()).rejects.toThrow('HTTP 503');
    await expect(fail()).rejects.toThrow('HTTP 503');
    expect(b.state).toBe('open');
    await expect(b.run(async () => 'x')).rejects.toBeInstanceOf(CircuitOpenError);
    t = 1500;
    expect(await b.run(async () => 'ok')).toBe('ok');
    expect(b.state).toBe('closed');
    expect(states).toEqual(['open', 'half_open', 'closed']);
  });
  it('un error nuestro (validación) no lo abre', async () => {
    const b = new CircuitBreaker('modelo', { failureThreshold: 1 });
    await expect(b.run(() => Promise.reject(httpError(400)))).rejects.toThrow();
    expect(b.state).toBe('closed');
  });
  it('si la prueba falla, vuelve a abrirse', async () => {
    let t = 0;
    const b = new CircuitBreaker('GitHub', { failureThreshold: 1, cooldownMs: 1000, now: () => t });
    await expect(b.run(() => Promise.reject(httpError(502)))).rejects.toThrow();
    t = 2000;
    await expect(b.run(() => Promise.reject(httpError(502)))).rejects.toThrow('HTTP 502');
    expect(b.state).toBe('open');
  });
  it('las capturas se saltean un rato cuando el sitio viene fallando', async () => {
    let calls = 0;
    const s = guardScreenshots(
      { enabled: true, capture: async () => (calls++, null), close: async () => {} },
      new CircuitBreaker('hosting', { failureThreshold: 2, cooldownMs: 60_000 }),
    );
    for (let i = 0; i < 5; i++) expect(await s.capture('https://sitio.example')).toBeNull();
    expect(calls).toBe(2);
  });
});

describe('logs', () => {
  it('JSON con el contexto del trabajo, el id del pedido y sin secretos', async () => {
    const lines: string[] = [];
    const log = createLogger({ format: 'json', secrets: ['clave-super-secreta-123'], base: { service: 'walt-worker' }, write: (l) => lines.push(l) });
    await runWithWork({ jobId: 'j1', kind: 'process_request', projectId: 'p1', requestId: 'r1' }, async () => {
      log.line('[derivado] falló con clave-super-secreta-123');
    });
    log.line('[derivado] 11111111-2222-4333-8444-555555555555: algo #K7Q2MX');
    const a = JSON.parse(lines[0]!);
    expect(a).toMatchObject({ level: 'warn', service: 'walt-worker', job_id: 'j1', kind: 'process_request', project_id: 'p1', request_id: 'r1' });
    expect(a.msg).toBe('[derivado] falló con [secreto]');
    const b = JSON.parse(lines[1]!);
    expect(b).toMatchObject({ request_id: '11111111-2222-4333-8444-555555555555', short_id: 'K7Q2MX', level: 'info' });
  });
  it('texto: las mismas líneas de siempre, sin los eventos de debug', () => {
    const lines: string[] = [];
    const log = createLogger({ format: 'text', write: (l) => lines.push(l) });
    log.line('[worker] arrancando');
    log.debug('[evento] interpretado ok', { step: 'interpretado' });
    log.info('[cola] algo', { n: 2 });
    expect(lines).toEqual(['[worker] arrancando', '[cola] algo n=2']);
  });
});

describe('health', () => {
  it('liveness, readiness (503 al cerrar o si falla la base) y métricas', async () => {
    let dbOk = true;
    const h = await startHealthServer({
      port: 0,
      checks: { base: async () => ({ ok: dbOk, detail: dbOk ? 'ok' : 'sin conexión' }) },
      metrics: async () => prometheus([{ name: 'walt_jobs', help: 'x', type: 'gauge', values: [{ labels: { queue: 'default', status: 'pending' }, value: 3 }] }]),
    });
    const port = (h.server.address() as AddressInfo).port;
    const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);
    try {
      expect((await get('/healthz')).status).toBe(200);
      const ready = await get('/readyz');
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({ status: 'ready', checks: { base: { ok: true } } });
      dbOk = false;
      expect((await get('/readyz')).status).toBe(503);
      dbOk = true;
      h.setDraining(true);
      expect(await (await get('/readyz')).json()).toMatchObject({ status: 'draining' });
      expect((await get('/healthz')).status).toBe(200);
      const metrics = await (await get('/metrics')).text();
      expect(metrics).toContain('walt_jobs{queue="default",status="pending"} 3');
      expect((await get('/nada')).status).toBe(404);
    } finally {
      await h.close();
    }
  });
});
