import type { Channel, OutMessage } from './types.js';

export interface SentMessage extends OutMessage {
  chatId: number;
  at: number;
}

/** Console channel (TELEGRAM_MODE=console): prints and keeps what it sent, for dry-run and tests. */
export class ConsoleChannel implements Channel {
  readonly name = 'console' as const;
  readonly sent: SentMessage[] = [];
  constructor(
    private readonly print: ((line: string) => void) | null = (l) => console.log(l),
    private readonly labels: Record<number, string> = {},
  ) {}

  async send(chatId: number, msg: OutMessage): Promise<void> {
    this.sent.push({ ...msg, chatId, at: Date.now() });
    if (!this.print) return;
    const who = this.labels[chatId] ?? `chat ${chatId}`;
    const photo = msg.photo ? ` [foto ${Math.round(msg.photo.length / 1024)} KB]` : '';
    const buttons = msg.buttons?.flat().map((b) => `[${b.text}${'data' in b ? ` → ${b.data}` : ` → ${b.url}`}]`).join(' ') ?? '';
    this.print(`  💬 → ${who}${photo}: ${msg.text}${buttons ? `\n       ${buttons}` : ''}`);
  }

  /** Last message to a chat with a button whose data starts with `prefix`. */
  lastButton(chatId: number, prefix: string): string | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!;
      if (m.chatId !== chatId) continue;
      const b = m.buttons?.flat().find((x) => 'data' in x && x.data.startsWith(prefix));
      if (b && 'data' in b) return b.data;
    }
    return undefined;
  }
}
