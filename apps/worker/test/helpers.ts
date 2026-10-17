import { createFakeProvider, type AiProvider } from '@dale/ai';
import type { RunCodeChangeResult } from '@dale/agent';
import { SEED_IDS, type ContactRow, type Interpretation } from '@dale/core';
import { bakeryContent } from '@dale/core/fixtures';
import { noScreenshots } from '../src/capture.js';
import { ConsoleChannel } from '../src/channel/console.js';
import { Worker, type AgentLane } from '../src/pipeline.js';
import { FakeSiteRepo } from '../src/site/repo.js';
import { MemoryStore, seedMemory } from '../src/store/memory.js';
import type { Store } from '../src/store/types.js';

export const CLIENT_CHAT = 101;
export const AGENCY_CHAT = 202;
export const SECRET = 'super-secreto-123456';

export const notImplementedAgent: AgentLane = {
  runCodeChange: async () => {
    throw new Error('runCodeChange: no implementado todavía (lo hace 04-agente-eval)');
  },
  mergeChange: async () => {
    throw new Error('no implementado');
  },
  revertChange: async () => {
    throw new Error('no implementado');
  },
};

export function okAgent(): AgentLane & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    runCodeChange: async (i): Promise<RunCodeChangeResult> => {
      calls.push(`run:${i.instruction}`);
      return { branch: `dale/${i.shortId}`, commitSha: 'abc', prNumber: 7, prUrl: 'https://github.com/x/y/pull/7', diff: '', changedFiles: ['app/page.tsx'], previewUrl: 'https://preview.example', logs: [] };
    },
    mergeChange: async (i) => {
      calls.push(`merge:${i.prNumber}`);
      return { mergeSha: 'm1' };
    },
    revertChange: async (i) => {
      calls.push(`revert:${i.mergeSha}`);
      return { revertSha: 'r1' };
    },
  };
}

/** Wraps the fake provider so a test can override the interpretation. */
export function aiWith(over: Partial<Interpretation> | ((text: string) => Partial<Interpretation> | null), base: AiProvider = createFakeProvider()): AiProvider {
  return {
    ...base,
    async interpret(input) {
      const r = await base.interpret(input);
      const o = typeof over === 'function' ? over(input.text) : over;
      return o ? { ...r, interpretation: { ...r.interpretation, ...o } } : r;
    },
  };
}

export interface Harness {
  store: MemoryStore;
  channel: ConsoleChannel;
  repo: FakeSiteRepo;
  worker: Worker;
  client: ContactRow;
  agency: ContactRow;
  logs: string[];
  say(text: string, updateId?: number): Promise<void>;
  press(data: string, chat?: number): Promise<void>;
  last(chat?: number): string;
  textsTo(chat: number): string[];
}

export async function harness(
  opts: { ai?: AiProvider; agent?: AgentLane; repo?: FakeSiteRepo; store?: Store; transcribe?: (audio: Buffer, mime: string) => Promise<string> } = {},
): Promise<Harness> {
  const store = new MemoryStore();
  seedMemory(store, { agencyName: 'Estudio Faro', siteUrl: 'https://sitio.example', repo: 'salvasecco/dale-demo', content: bakeryContent() });
  const client = await store.ensureContact({ project_id: SEED_IDS.project, role: 'cliente', display_name: 'Mabel', telegram_chat_id: CLIENT_CHAT });
  const agency = await store.ensureContact({ project_id: SEED_IDS.project, role: 'agencia', display_name: 'Faro', telegram_chat_id: AGENCY_CHAT });
  const channel = new ConsoleChannel(null);
  const repo = opts.repo ?? new FakeSiteRepo(null);
  const logs: string[] = [];
  const worker = new Worker({
    store,
    channel,
    ai: opts.ai ?? createFakeProvider(),
    repo,
    screenshots: noScreenshots,
    agent: opts.agent ?? notImplementedAgent,
    secrets: [SECRET],
    defaultSiteUrl: 'http://localhost:3001',
    now: () => new Date('2026-10-17T17:00:00Z'),
    log: (l) => logs.push(l),
    transcribe: opts.transcribe ?? null,
  });
  const h: Harness = {
    store,
    channel,
    repo,
    worker,
    client,
    agency,
    logs,
    async say(text, updateId) {
      await worker.handle({ kind: 'text', chatId: CLIENT_CHAT, fromName: 'Mabel', text, updateId });
      await worker.idle();
    },
    async press(data, chat = CLIENT_CHAT) {
      await worker.handle({ kind: 'callback', chatId: chat, fromName: 'x', data });
      await worker.idle();
    },
    last(chat = CLIENT_CHAT) {
      return channel.sent.filter((m) => m.chatId === chat).at(-1)?.text ?? '';
    },
    textsTo(chat) {
      return channel.sent.filter((m) => m.chatId === chat).map((m) => m.text);
    },
  };
  return h;
}

export function livePrice(store: MemoryStore, id: string): number {
  const live = store.versions.find((v) => v.status === 'viva')!;
  return (live.content as { products: { id: string; price: number }[] }).products.find((p) => p.id === id)!.price;
}
