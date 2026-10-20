import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SupabaseStore } from '../src/store/supabase.js';

/**
 * The R1 worker against a base without 0004: the old `requests.category` check only takes the pre-R1
 * names, so the store writes those and reads everything back with the R1 names.
 */
type Row = Record<string, unknown>;

function fakeDb(stored: Row) {
  const writes: { op: 'insert' | 'update'; values: Row }[] = [];
  const chain = (row: () => Row) => {
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      single: async () => ({ data: row(), error: null }),
      maybeSingle: async () => ({ data: row(), error: null }),
    };
    return b;
  };
  const db = {
    from: () => ({
      insert: (values: Row) => {
        writes.push({ op: 'insert', values });
        return chain(() => ({ ...stored, ...values }));
      },
      update: (values: Row) => {
        writes.push({ op: 'update', values });
        return chain(() => ({ ...stored, ...values }));
      },
      select: () => chain(() => stored),
    }),
  };
  return { db: db as unknown as SupabaseClient, writes };
}

function storeWith(db: SupabaseClient, r1: boolean): SupabaseStore {
  const store = new SupabaseStore(db);
  // The real probe goes over REST; here the schema is given.
  Object.assign(store, { schemaP: Promise.resolve({ r1, missing: r1 ? [] : ['jobs'] }) });
  return store;
}

const base: Row = { id: 'req-1', short_id: 'ABC234', status: 'recibido', category: null, cost_usd: '0' };

describe('SupabaseStore con la base sin 0004', () => {
  it('escribe las categorías con los nombres viejos y las lee con los del R1', async () => {
    const { db, writes } = fakeDb(base);
    const store = storeWith(db, false);
    for (const [r1Name, old] of [['simple', 'permitido'], ['delicado', 'riesgoso'], ['nuevo', 'fuera_de_alcance']] as const) {
      const row = await store.updateRequest('req-1', { category: r1Name, status: 'esperando_cliente' });
      expect(writes.at(-1)!.values).toMatchObject({ category: old, status: 'esperando_cliente' });
      expect(row.category).toBe(r1Name);
    }
    // The names that did not change are written as they are.
    await store.updateRequest('req-1', { category: 'consulta' });
    expect(writes.at(-1)!.values).toMatchObject({ category: 'consulta' });
    // A patch without category is not touched.
    await store.updateRequest('req-1', { status: 'publicado' });
    expect(writes.at(-1)!.values).toEqual({ status: 'publicado' });
  });

  it('lee una fila vieja con el nombre del R1', async () => {
    const { db } = fakeDb({ ...base, category: 'riesgoso' });
    const store = storeWith(db, false);
    expect((await store.getRequest('req-1'))!.category).toBe('delicado');
    expect((await store.getRequestByShortId('ABC234'))!.category).toBe('delicado');
  });

  it('con 0004 escribe los nombres del R1 tal cual', async () => {
    const { db, writes } = fakeDb(base);
    const store = storeWith(db, true);
    const row = await store.updateRequest('req-1', { category: 'simple' });
    expect(writes.at(-1)!.values).toMatchObject({ category: 'simple' });
    expect(row.category).toBe('simple');
  });
});
