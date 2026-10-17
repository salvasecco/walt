import { SEED_IDS, type ContactRow } from '@walt/core';
import type { Store } from './store/types.js';

/** Fixed chat ids of the console channel (real Telegram chats never use them). */
export const CONSOLE_CHATS = { cliente: 1, agencia: 2 } as const;

export async function ensureConsoleContacts(store: Store, projectId: string = SEED_IDS.project): Promise<{ cliente: ContactRow; agencia: ContactRow }> {
  const project = await store.getProject(projectId);
  if (!project) throw new Error(`No existe el proyecto ${projectId}. ¿Corriste pnpm seed?`);
  const cliente = await store.ensureContact({ project_id: projectId, role: 'cliente', display_name: 'Consola (cliente)', telegram_chat_id: CONSOLE_CHATS.cliente });
  const agencia = await store.ensureContact({ project_id: projectId, role: 'agencia', display_name: 'Consola (agencia)', telegram_chat_id: CONSOLE_CHATS.agencia });
  return { cliente, agencia };
}
