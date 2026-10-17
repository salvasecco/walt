import type { Browser } from 'playwright';
import { withTimeout } from './queue.js';

export const CAPTURE_TIMEOUT_MS = 25_000;

/** Phone screenshot of a preview URL. Returns null if off or if it fails (the link goes without photo). */
export interface Screenshotter {
  readonly enabled: boolean;
  capture(url: string): Promise<Buffer | null>;
  close(): Promise<void>;
}

export const noScreenshots: Screenshotter = {
  enabled: false,
  capture: async () => null,
  close: async () => {},
};

/** Playwright Chromium at 390×844 (SPEC §9), one browser reused across captures. */
export class PlaywrightScreenshotter implements Screenshotter {
  readonly enabled = true;
  private browser: Promise<Browser> | null = null;

  constructor(
    private readonly timeoutMs = CAPTURE_TIMEOUT_MS,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = import('playwright').then(({ chromium }) => chromium.launch({ headless: true }));
      this.browser.catch(() => {
        this.browser = null;
      });
    }
    return this.browser;
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
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeoutMs });
      return await page.screenshot({ type: 'png' });
    } finally {
      await context.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b) await (await b.catch(() => null))?.close();
  }
}
