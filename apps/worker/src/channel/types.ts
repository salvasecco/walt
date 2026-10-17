/** Inline button: callback data (max 64 bytes, SPEC §12) or a link. */
export type Button = { text: string; data: string } | { text: string; url: string };

export interface OutMessage {
  text: string;
  /** PNG of the preview; sent as a photo with `text` as caption. */
  photo?: Buffer | null;
  /** Rows of buttons. */
  buttons?: Button[][];
}

/** Where messages go: Telegram (grammY) or the console. */
export interface Channel {
  readonly name: 'telegram' | 'console';
  send(chatId: number, msg: OutMessage): Promise<void>;
}

/** Normalized incoming update, independent of Telegram. */
export type Incoming =
  | { kind: 'start'; updateId?: number; chatId: number; fromName: string; token?: string }
  | { kind: 'text'; updateId?: number; chatId: number; fromName: string; text: string }
  | { kind: 'callback'; updateId?: number; chatId: number; fromName: string; data: string }
  | { kind: 'voice'; updateId?: number; chatId: number; fromName: string; download: () => Promise<{ data: Buffer; mime: string }> }
  | { kind: 'other'; updateId?: number; chatId: number; fromName: string };
