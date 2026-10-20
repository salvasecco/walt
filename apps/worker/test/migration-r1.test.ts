import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshPglite, MIGRATIONS } from './pglite.js';

const F = '22222222-2222-4222-8222-222222222222';
const P = '11111111-1111-4111-8111-111111111111';
const F2 = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';
const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Runs `fn` as a Supabase user (role authenticated, JWT sub) or as anon, then goes back to the superuser. */
async function as<T>(pg: PGlite, who: { role: 'authenticated' | 'anon'; sub?: string }, fn: () => Promise<T>): Promise<T> {
  await pg.exec(`set role ${who.role}`);
  await pg.query(`select set_config('request.jwt.claims', $1, false)`, [who.sub ? JSON.stringify({ sub: who.sub }) : '']);
  try {
    return await fn();
  } finally {
    await pg.exec('reset role');
    await pg.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

describe('migraciones 0004 y 0005 sobre una base con datos (PGlite)', () => {
  let pg: PGlite;
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;

  beforeAll(async () => {
    pg = await freshPglite({ upTo: '0003' });
    await q(`insert into factories (id, name, assistant_name) values ($1, 'Faro', 'a'), ($2, 'Otra', 'b')`, [F, F2]);
    await q(`insert into projects (id, factory_id, name, client_name, repo_owner, repo_name) values ($1, $3, 'P', 'M', 'o', 'r'), ($2, $4, 'P2', 'X', 'o', 'r2')`, [P, P2, F, F2]);
    await q(
      `insert into requests (short_id, project_id, raw_text, category, updated_at) values
       ('AAA', $1, 'subí el pan flauta a 95', 'permitido', '2026-01-01'),
       ('BBB', $1, 'cambiá el login', 'riesgoso', '2026-01-01'),
       ('CCC', $2, 'quiero una pasarela de pagos', 'fuera_de_alcance', '2026-01-01'),
       ('DDD', $1, '¿a qué hora abren?', 'consulta', '2026-01-01')`,
      [P, P2],
    );
    await q(`insert into processed_updates (update_id) values (1), (2)`);
    await q(`insert into content_versions (project_id, status, content, published_at) values ($1, 'viva', '{}', now()), ($1, 'reemplazada', '{}', now())`, [P]);
    // Applied twice each: both are idempotent.
    for (const f of ['0004_r1.sql', '0004_r1.sql', '0005_r1_cierre_anon.sql', '0005_r1_cierre_anon.sql', '0006_r1_vistas_previas.sql', '0006_r1_vistas_previas.sql']) {
      await pg.exec(readFileSync(MIGRATIONS + f, 'utf8'));
    }
    await q(`insert into auth.users (id) values ($1), ($2), ($3)`, [MEMBER, OWNER2, ADMIN]);
    await q(`insert into memberships (user_id, factory_id, role) values ($1, $3, 'member'), ($2, $4, 'owner'), ($5, $3, 'admin')`, [MEMBER, OWNER2, F, F2, ADMIN]);
  });
  afterAll(async () => {
    await pg.close();
  });

  it('migra las categorías sin tocar updated_at y traduce las viejas al escribir', async () => {
    const rows = await q<{ short_id: string; category: string; updated_at: Date }>('select short_id, category, updated_at from requests order by short_id');
    expect(rows.map((r) => [r.short_id, r.category])).toEqual([['AAA', 'simple'], ['BBB', 'delicado'], ['CCC', 'nuevo'], ['DDD', 'consulta']]);
    expect(rows.every((r) => new Date(r.updated_at).getTime() < Date.parse('2026-01-02'))).toBe(true);
    expect(await q(`update requests set category = 'riesgoso' where short_id = 'DDD' returning category`)).toEqual([{ category: 'delicado' }]);
    await expect(q(`update requests set category = 'cualquiera' where short_id = 'DDD'`)).rejects.toThrow(/requests_category_check/);
  });

  it('numera las versiones existentes y las nuevas', async () => {
    const rows = await q<{ version: number }>('select version from content_versions where project_id = $1 order by version', [P]);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    const [n] = await q<{ version: number }>(`insert into content_versions (project_id, content) values ($1, '{}') returning version`, [P]);
    expect(n!.version).toBe(3);
  });

  it('processed_updates acepta update_id (worker viejo) y claves de texto', async () => {
    expect(await q('insert into processed_updates (update_id) values (1) on conflict (update_id) do nothing returning id')).toEqual([]);
    expect((await q(`insert into processed_updates (key, source) values ('wa:1', 'whatsapp') on conflict (key) do nothing returning id`)).length).toBe(1);
    await expect(q('insert into processed_updates (source) values ($1)', ['x'])).rejects.toThrow(/processed_updates_has_key/);
  });

  it('un miembro ve y escribe solo lo de su agencia', async () => {
    await as(pg, { role: 'authenticated', sub: MEMBER }, async () => {
      expect((await q<{ name: string }>('select name from factories')).map((r) => r.name)).toEqual(['Faro']);
      expect((await q<{ short_id: string }>('select short_id from requests order by short_id')).map((r) => r.short_id)).toEqual(['AAA', 'BBB', 'DDD']);
      const [aaa] = await q<{ id: string }>(`select id from requests where short_id = 'AAA'`);
      // Members: commands, relabels and invites yes; rules no (admin).
      await q(`insert into commands (type, request_id) values ('aprobar', $1)`, [aaa!.id]);
      const [label] = await q<{ from_category: string; actor_user_id: string }>(`select * from label_request($1, 'delicado', 'tocaba auth')`, [aaa!.id]);
      expect(label).toMatchObject({ from_category: 'simple', actor_user_id: MEMBER });
      await q(`insert into invites (token, project_id, role, expires_at) values ('t1', $1, 'cliente', now() + interval '1 day')`, [P]);
      await expect(q(`insert into rules (project_id, version, policies, limits) values ($1, 9, '{}', '{}')`, [P])).rejects.toThrow(/row-level security/);
      await expect(q(`insert into invites (token, project_id, role, expires_at) values ('t2', $1, 'cliente', now())`, [P2])).rejects.toThrow(/row-level security/);
      const [ccc] = await q(`select id from requests where short_id = 'CCC'`);
      expect(ccc).toBeUndefined();
      expect(await q(`select raw_text from similar_labeled_requests($1, 'pan', 5)`, [F2])).toEqual([]);
    });
  });

  it('un admin maneja reglas y equipo, pero no dueños', async () => {
    await as(pg, { role: 'authenticated', sub: ADMIN }, async () => {
      await q(`insert into rules (project_id, version, policies, limits, policy_text) values ($1, 2, '{}', '{}', 'Lo de pagos es delicado')`, [P]);
      await expect(q(`update memberships set role = 'owner' where user_id = $1`, [MEMBER])).rejects.toThrow(/row-level security/);
      await expect(q(`select get_ai_key($1)`, [F])).rejects.toThrow(/permission denied/);
      await expect(q(`select * from claim_job('x')`)).rejects.toThrow(/permission denied/);
    });
  });

  it('create_factory deja al usuario como dueño', async () => {
    const id = await as(pg, { role: 'authenticated', sub: OWNER2 }, async () => {
      const [r] = await q<{ id: string }>(`select create_factory('Estudio Nuevo') as id`);
      expect((await q<{ name: string }>('select name from factories order by name')).map((x) => x.name)).toEqual(['Estudio Nuevo', 'Otra']);
      return r!.id;
    });
    expect(await q(`select role from memberships where factory_id = $1 and user_id = $2`, [id, OWNER2])).toEqual([{ role: 'owner' }]);
    expect(await q(`select assistant_name from factories where id = $1`, [id])).toEqual([{ assistant_name: 'el asistente de Estudio Nuevo' }]);
  });

  it('0006: config_path nuevo por defecto y en las filas viejas', async () => {
    expect(await q(`select distinct config_path from projects`)).toEqual([{ config_path: 'walt.config.json' }]);
    const [p] = await q<{ config_path: string }>(`insert into projects (factory_id, name, client_name, repo_owner, repo_name) values ($1, 'N', 'C', 'o', 'n') returning config_path`, [F]);
    expect(p!.config_path).toBe('walt.config.json');
  });

  it('después de 0005 y 0006 la anon solo lee la versión viva, y un borrador por su id con la RPC', async () => {
    const [draft] = await q<{ id: string }>(`select id from content_versions where status <> 'viva' order by version desc limit 1`);
    await as(pg, { role: 'anon' }, async () => {
      expect(await q('select status from content_versions')).toEqual([{ status: 'viva' }]);
      expect(await q(`select id, status from get_preview_version($1)`, [draft!.id])).toEqual([{ id: draft!.id, status: expect.any(String) }]);
      expect(await q(`select * from get_preview_version('00000000-0000-4000-8000-000000000000')`)).toEqual([]);
      for (const t of ['requests', 'messages', 'events', 'clients', 'projects', 'quotes', 'jobs', 'memberships']) {
        await expect(q(`select * from ${t} limit 1`)).rejects.toThrow(/permission denied/);
      }
      await expect(q(`select * from similar_labeled_requests($1, 'pan')`, [F])).rejects.toThrow(/permission denied/);
    });
  });
});

describe('orden de Salva: 0004 → 0006 → 0005 (PGlite)', () => {
  it('la vista previa del sitio sigue andando para la anon después de cerrarla', async () => {
    const pg = await freshPglite({ upTo: '0003' });
    try {
      const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
      await q(`insert into factories (id, name, assistant_name) values ($1, 'Faro', 'a')`, [F]);
      await q(`insert into projects (id, factory_id, name, client_name, repo_owner, repo_name) values ($1, $2, 'P', 'M', 'o', 'r')`, [P, F]);
      await q(`insert into content_versions (project_id, status, content, published_at) values ($1, 'viva', '{}', now())`, [P]);
      const [draft] = await q<{ id: string }>(`insert into content_versions (project_id, status, content) values ($1, 'borrador', '{"x":1}') returning id`, [P]);
      for (const f of ['0004_r1.sql', '0006_r1_vistas_previas.sql', '0005_r1_cierre_anon.sql']) await pg.exec(readFileSync(MIGRATIONS + f, 'utf8'));
      await as(pg, { role: 'anon' }, async () => {
        expect(await q(`select id, status from get_preview_version($1)`, [draft!.id])).toEqual([{ id: draft!.id, status: 'borrador' }]);
        expect(await q('select status from content_versions')).toEqual([{ status: 'viva' }]);
        await expect(q(`select * from similar_labeled_requests($1, 'pan')`, [F])).rejects.toThrow(/permission denied/);
      });
    } finally {
      await pg.close();
    }
  });
});
