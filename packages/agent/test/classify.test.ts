import { ruleTemplate } from '@walt/core';
import { describe, expect, it } from 'vitest';
import { classifyDiff, DEFAULT_PROTECTED_GLOBS, protectedGlobsFor } from '../src/index.js';

/** A minimal unified diff that adds `lines` to `path`. */
function diffFor(path: string, lines: string[]): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');
}

const nextjs = ruleTemplate('nextjs-supabase').config;

describe('doble clasificación: el diff real contra las zonas delicadas', () => {
  it('un componente de interfaz queda simple', () => {
    const diff = diffFor('components/AvisoEnvio.tsx', ['export function AvisoEnvio() {', '  return <p>Envío gratis desde $1000</p>;', '}']);
    expect(classifyDiff({ diff, files: ['components/AvisoEnvio.tsx', 'app/page.tsx'], config: nextjs })).toEqual({ category: 'simple', reasons: [], paths: [] });
  });

  it('un formulario que manda por WhatsApp queda simple', () => {
    const diff = diffFor('components/ReservaTortas.tsx', [
      "'use client';",
      'export function ReservaTortas() {',
      "  const send = (t: string) => window.open(`https://wa.me/59899000000?text=${encodeURIComponent(t)}`);",
      '  const params = new URLSearchParams(); params.delete("x");',
      '  return <form onSubmit={() => send("hola")} />;',
      '}',
    ]);
    expect(classifyDiff({ diff, files: ['components/ReservaTortas.tsx'], config: nextjs }).category).toBe('simple');
  });

  it('una migración sube a delicado aunque la IA haya dicho simple', () => {
    const diff = diffFor('supabase/migrations/0004_reservas.sql', ['create table reservas (id uuid primary key);']);
    const c = classifyDiff({ diff, files: ['supabase/migrations/0004_reservas.sql'], config: nextjs });
    expect(c.category).toBe('delicado');
    expect(c.reasons).toEqual(
      expect.arrayContaining(['Toca supabase/migrations/0004_reservas.sql: la base de datos', 'El diff agrega SQL que cambia la base de datos']),
    );
    expect(c.paths[0]).toMatchObject({ zone: 'base' });
  });

  it('un endpoint nuevo en app/api es delicado con la plantilla de Next.js, y por contenido en cualquier lado', () => {
    const route = diffFor('app/api/reservas/route.ts', ['export async function POST(req: Request) {', '  return Response.json({ ok: true });', '}']);
    const c = classifyDiff({ diff: route, files: ['app/api/reservas/route.ts'], config: nextjs });
    expect(c.category).toBe('delicado');
    expect(c.reasons.join(' ')).toMatch(/zona delicada de las reglas del proyecto \(app\/api\/\*\*\)/);
    expect(c.reasons).toContain('El diff agrega un endpoint de API');
    // Same handler in a folder no glob knows: the content gives it away.
    const odd = diffFor('src/rutas/reservas.ts', ['export const POST = async () => new Response("ok");']);
    expect(classifyDiff({ diff: odd, files: ['src/rutas/reservas.ts'], config: nextjs }).category).toBe('delicado');
  });

  it('el login, las server actions y las escrituras a la base son delicadas', () => {
    const login = diffFor('app/admin/login/page.tsx', ['await supabase.auth.signInWithPassword({ email, password });']);
    expect(classifyDiff({ diff: login, files: ['app/admin/login/page.tsx'], config: nextjs }).reasons).toContain('El diff toca el login o la sesión');
    const action = diffFor('app/reservas/guardar.ts', ["'use server';", 'export async function guardar() {}']);
    expect(classifyDiff({ diff: action, files: ['app/reservas/guardar.ts'], config: nextjs }).category).toBe('delicado');
    const write = diffFor('components/Form.tsx', ['await supabase', "  .from('reservas')", '  .insert({ nombre });']);
    expect(classifyDiff({ diff: write, files: ['components/Form.tsx'], config: nextjs }).reasons).toContain('El diff escribe o borra datos en la base');
  });

  it('.env, package.json y el CI son delicados aunque la agencia los marque simples (piso)', () => {
    const files = ['.env.local', 'package.json', '.github/workflows/deploy.yml'];
    const c = classifyDiff({ diff: '', files, config: { ...nextjs, simpleGlobs: ['**'] } });
    expect(c.category).toBe('delicado');
    expect(c.paths.map((p) => p.zone)).toEqual(['base', 'base', 'base']);
  });

  it('la excepción simple de la agencia baja un glob de la plantilla, nunca el piso', () => {
    const route = diffFor('app/api/contacto/route.ts', ['const x = 1;']);
    expect(classifyDiff({ diff: route, files: ['app/api/contacto/route.ts'], config: { ...nextjs, simpleGlobs: ['app/api/contacto/**'] } }).paths).toEqual([]);
  });

  it('lo protegido por la agencia y lo que rechaza reviewDiff también suben a delicado', () => {
    const c = classifyDiff({ diff: diffFor('lib/precios.ts', ['export const x = eval("1");']), files: ['lib/precios.ts'], config: { ...nextjs, protectedGlobs: ['lib/precios.ts'] } });
    expect(c.category).toBe('delicado');
    expect(c.reasons).toEqual(expect.arrayContaining(['Toca lib/precios.ts, que la agencia marcó como protegido (lib/precios.ts)', 'El diff usa eval(']));
  });

  it('sin config usa la plantilla genérica', () => {
    expect(classifyDiff({ diff: '', files: ['server/db.ts'] }).category).toBe('delicado');
    expect(classifyDiff({ diff: '', files: ['src/components/Hero.tsx'] }).category).toBe('simple');
  });

  it('el guard del agente suma lo protegido por la agencia', () => {
    expect(protectedGlobsFor({ protectedGlobs: ['lib/precios.ts'] })).toEqual([...DEFAULT_PROTECTED_GLOBS, 'lib/precios.ts']);
    expect(protectedGlobsFor()).toEqual(DEFAULT_PROTECTED_GLOBS);
  });
});
