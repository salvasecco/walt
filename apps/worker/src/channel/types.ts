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
  | {
      kind: 'voice';
      updateId?: number;
      chatId: number;
      fromName: string;
      download: () => Promise<{ data: Buffer; mime: string }>;
      /** Telegram's file id and type: what travels in the durable queue (the download is rebuilt from it). */
      fileId?: string;
      mime?: string;
    }
  | { kind: 'other'; updateId?: number; chatId: number; fromName: string };

/** An incoming update as JSON for the durable queue: everything but the voice download function. */
export type IncomingPayload =
  | Exclude<Incoming, { kind: 'voice' }>
  | { kind: 'voice'; updateId?: number; chatId: number; fromName: string; fileId: string; mime: string };

/** Null for a voice note without a file id (it cannot be downloaded again later). */
export function toPayload(u: Incoming): IncomingPayload | null {
  if (u.kind !== 'voice') return { ...u };
  if (!u.fileId) return null;
  return { kind: 'voice', updateId: u.updateId, chatId: u.chatId, fromName: u.fromName, fileId: u.fileId, mime: u.mime ?? 'audio/ogg' };
}

/** Back to an `Incoming`; voice notes get their download from the channel. */
export function fromPayload(p: IncomingPayload, voice: (fileId: string, mime: string) => () => Promise<{ data: Buffer; mime: string }>): Incoming {
  if (p.kind !== 'voice') return p;
  return { ...p, download: voice(p.fileId, p.mime) };
}
