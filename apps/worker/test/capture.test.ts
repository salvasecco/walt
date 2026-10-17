import { EventEmitter } from 'node:events';
import type { Browser } from 'playwright';
import { describe, expect, it } from 'vitest';
import { PlaywrightScreenshotter } from '../src/capture.js';

/** Minimal fake browser: counts contexts, can be "crashed". */
function fakeBrowser() {
  const ev = new EventEmitter();
  let connected = true;
  const stats = { contexts: 0, closed: 0 };
  const page = { goto: async () => null, evaluate: async () => true, screenshot: async () => Buffer.from('png') };
  const browser = {
    isConnected: () => connected,
    on: (e: string, f: () => void) => ev.on(e, f),
    newContext: async () => {
      stats.contexts++;
      return { newPage: async () => page, close: async () => {} };
    },
    close: async () => {
      stats.closed++;
      connected = false;
      ev.emit('disconnected');
    },
    crash: () => {
      connected = false;
      ev.emit('disconnected');
    },
  };
  return { browser, stats };
}

describe('PlaywrightScreenshotter', () => {
  it('reutiliza el navegador, relanza si se cae y lo cierra en close()', async () => {
    const made: ReturnType<typeof fakeBrowser>[] = [];
    const s = new PlaywrightScreenshotter(5_000, () => {}, async () => {
      const f = fakeBrowser();
      made.push(f);
      return f.browser as unknown as Browser;
    });
    s.warm();
    expect(await s.capture('https://x')).toEqual(Buffer.from('png'));
    expect(await s.capture('https://x')).toEqual(Buffer.from('png'));
    expect(s.launches).toBe(1);
    expect(made[0]!.stats.contexts).toBe(2);
    made[0]!.browser.crash();
    expect(await s.capture('https://x')).toEqual(Buffer.from('png'));
    expect(s.launches).toBe(2);
    await s.close();
    expect(made[1]!.stats.closed).toBe(1);
  });
});
