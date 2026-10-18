import { createServer, type Server } from 'node:http';
import { autoRetry } from '@grammyjs/auto-retry';
import { Bot, InlineKeyboard, InputFile, webhookCallback, type Context } from 'grammy';
import type { Channel, Incoming, OutMessage } from './types.js';

const CAPTION_MAX = 1024;
const TEXT_MAX = 4096;

export function keyboard(rows: OutMessage['buttons']): InlineKeyboard | undefined {
  if (!rows?.length) return undefined;
  const kb = new InlineKeyboard();
  rows.forEach((row, i) => {
    for (const b of row) {
      if ('url' in b) kb.url(b.text, b.url);
      else kb.text(b.text, b.data.slice(0, 64));
    }
    if (i < rows.length - 1) kb.row();
  });
  return kb;
}

/** Maps a grammY context to a normalized incoming update (or null to ignore). */
export function toIncoming(ctx: Context, token: string): Incoming | null {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return null;
  const from = ctx.from;
  const fromName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username || 'Sin nombre';
  const updateId = ctx.update.update_id;
  if (ctx.callbackQuery?.data) return { kind: 'callback', updateId, chatId, fromName, data: ctx.callbackQuery.data };
  const msg = ctx.message;
  if (!msg) return null;
  if (msg.text) {
    const start = msg.text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/);
    if (start) return { kind: 'start', updateId, chatId, fromName, token: start[1] };
    return { kind: 'text', updateId, chatId, fromName, text: msg.text };
  }
  const voice = msg.voice ?? msg.audio;
  if (voice) {
    const fileId = voice.file_id;
    const mime = voice.mime_type ?? 'audio/ogg';
    return {
      kind: 'voice',
      updateId,
      chatId,
      fromName,
      download: async () => {
        const file = await ctx.api.getFile(fileId);
        // The URL carries the bot token: never log it.
        const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`No pude bajar el audio (HTTP ${res.status})`);
        return { data: Buffer.from(await res.arrayBuffer()), mime };
      },
    };
  }
  if (msg.caption) return { kind: 'text', updateId, chatId, fromName, text: msg.caption };
  return { kind: 'other', updateId, chatId, fromName };
}

/**
 * Telegram with grammY (SPEC §12): polling locally, webhook with the secret header on a
 * server. Handlers only enqueue, so updates are acknowledged fast.
 */
/** Chat ids below this (in absolute value) are console or sample contacts, never real chats. */
export const FAKE_CHAT_LIMIT = 100_000;

export class TelegramChannel implements Channel {
  readonly name = 'telegram' as const;
  readonly bot: Bot;
  private server: Server | null = null;

  constructor(private readonly token: string, private readonly log: (l: string) => void = (l) => console.log(l)) {
    this.bot = new Bot(token);
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 10 }));
  }

  async send(chatId: number, msg: OutMessage): Promise<void> {
    // Console (dry-run) and sample contacts use small fake chat ids; real Telegram ids are much larger.
    if (Math.abs(chatId) < FAKE_CHAT_LIMIT) return;
    const reply_markup = keyboard(msg.buttons);
    if (msg.photo) {
      try {
        if (msg.text.length <= CAPTION_MAX) {
          await this.bot.api.sendPhoto(chatId, new InputFile(msg.photo, 'vista-previa.png'), { caption: msg.text, reply_markup });
          return;
        }
        await this.bot.api.sendPhoto(chatId, new InputFile(msg.photo, 'vista-previa.png'));
      } catch (err) {
        this.log(`[telegram] la foto no salió, mando el texto: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await this.bot.api.sendMessage(chatId, msg.text.slice(0, TEXT_MAX), { reply_markup, link_preview_options: { is_disabled: true } });
  }

  /** Registers the handler. `handle` must not throw (Worker.handle never does). */
  onUpdate(handle: (u: Incoming) => Promise<void>): void {
    this.bot.on(['message', 'callback_query:data'], async (ctx) => {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
      const u = toIncoming(ctx, this.token);
      if (u) await handle(u);
    });
    this.bot.catch((err) => this.log(`[telegram] ${err.message}`));
  }

  async startPolling(): Promise<void> {
    await this.bot.api.deleteWebhook().catch(() => {});
    void this.bot.start({ allowed_updates: ['message', 'callback_query'], onStart: (me) => this.log(`[telegram] polling como @${me.username}`) });
  }

  /** Webhook on `${publicUrl}/telegram`, validating `X-Telegram-Bot-Api-Secret-Token`. */
  async startWebhook(publicUrl: string, secret: string, port: number): Promise<void> {
    const handler = webhookCallback(this.bot, 'http', { secretToken: secret });
    this.server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/telegram') return void handler(req, res);
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => this.server!.listen(port, r));
    await this.bot.init();
    await this.bot.api.setWebhook(`${publicUrl.replace(/\/$/, '')}/telegram`, {
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
    });
    this.log(`[telegram] webhook como @${this.bot.botInfo.username} en el puerto ${port}`);
  }

  async stop(): Promise<void> {
    await this.bot.stop().catch(() => {});
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }
}
