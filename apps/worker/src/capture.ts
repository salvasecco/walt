import type { Browser } from 'playwright';
import { withTimeout } from './queue.js';

export const CAPTURE_TIMEOUT_MS = 25_000;

/** Phone screenshot of a preview URL. Returns null if off or if it fails (the link goes without photo). */
export interface Screenshotter {
  readonly enabled: boolean;
  capture(url: string): Promise<Buffer | null>;
  /** Optional: start the browser ahead of the first capture. */
  warm?(): void;
  close(): Promise<void>;
}

export const noScreenshots: Screenshotter = {
  enabled: false,
  capture: async () => null,
  close: async () => {},
};

/**
 * Playwright Chromium at 390×844 (SPEC §9). One browser stays open and is reused: each capture
 * opens its own context and page and closes them. If the browser dies it is launched again on the
 * next capture; `close()` shuts it down.
 */
export class PlaywrightScreenshotter implements Screenshotter {
  readonly enabled = true;
  private browser: Promise<Browser> | null = null;
  launches = 0;

  constructor(
    private readonly timeoutMs = CAPTURE_TIMEOUT_MS,
    private readonly log: (msg: string) => void = () => {},
    private readonly launch: () => Promise<Browser> = () => import('playwright').then(({ chromium }) => chromium.launch({ headless: true })),
  ) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      const b = await this.browser.catch(() => null);
      if (b?.isConnected()) return b;
      this.browser = null;
    }
    this.launches++;
    const p = this.launch();
    this.browser = p;
    p.then(
      (b) =>
        b.on('disconnected', () => {
          if (this.browser === p) this.browser = null;
        }),
      () => {
        if (this.browser === p) this.browser = null;
      },
    );
    return p;
  }

  warm(): void {
    this.getBrowser().catch((err) => this.log(`no pude abrir el navegador: ${err instanceof Error ? err.message : String(err)}`));
  }

  async capture(url: string): Promise<Buffer | null> {
    try {
      return await withTimeout(this.shoot(url), this.timeoutMs, 'Captura');
    } catch (err) {
      this.log(`captura falló: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async shoot(url: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'es-UY',
      timezoneId: 'America/Montevideo',
    });
    try {
      const page = await context.newPage();
      // `load` plus the web fonts instead of `networkidle` (which always waits 500 ms more of silence).
      await page.goto(url, { waitUntil: 'load', timeout: this.timeoutMs });
      await page.evaluate('document.fonts.ready.then(() => true)').catch(() => {});
      return await page.screenshot({ type: 'png' });
    } finally {
      await context.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b) await (await b.catch(() => null))?.close().catch(() => {});
  }
}
