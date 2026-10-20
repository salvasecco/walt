/**
 * How each agency pays for the AI (brief §4), from the console, until the panel has its screen:
 *   pnpm ai:status <factory_id>
 *   pnpm ai:key set <factory_id> [--project <id>]     the key is read from stdin (pasted or piped), never from argv
 *   pnpm ai:key clear <factory_id> [--project <id>]
 *   pnpm ai:mode <factory_id> walt|byok|credits|claude_code [--project <id>] [--cap <USD por mes>]
 *   pnpm ai:credit <factory_id> <USD> [--reference <id>]   recharge or adjustment (idempotent by reference)
 * Needs migration 0004. Goes through supabase-js with the service role (HTTPS only). Never prints a key.
 */
import { randomUUID } from 'node:crypto';
import { loadEnv } from '@walt/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkAnthropicKey, KEY_CHECK_TEXT } from './lib/anthropic-key.js';
import { connect, must, runMain } from './lib/db.js';

const MODES = ['walt', 'byok', 'credits', 'claude_code'] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function positional(): string[] {
  const out: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a.startsWith('--')) i++;
    else if (a !== '--') out.push(a);
  }
  return out;
}

/** Reads a secret without echoing it: hidden typing on a terminal, or the whole stdin when piped. */
async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') return done();
        if (c === '\u0003') {
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f') value = value.slice(0, -1);
        else value += c;
      }
    };
    const done = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
      resolve(value.trim());
    };
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function factoryName(db: SupabaseClient, id: string): Promise<string> {
  const f = must(await db.from('factories').select('name').eq('id', id).maybeSingle(), 'factories');
  if (!f) throw new Error(`No existe la agencia ${id}`);
  return (f as { name: string }).name;
}

function monthStart(): string {
  const local = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3)).toISOString();
}

runMain('ai', async () => {
  const env = loadEnv();
  const db = connect(env);
  const [cmd, first, second, third] = positional();
  const project = arg('--project') ?? null;

  if (cmd === 'status') {
    const factory = first;
    if (!factory) throw new Error('Uso: pnpm ai:status <factory_id>');
    const name = await factoryName(db, factory);
    const settings = must(await db.from('ai_settings').select('project_id, mode, key_hint, key_validated_at, monthly_cap_usd, request_cap_usd').eq('factory_id', factory), 'ai_settings') as {
      project_id: string | null; mode: string; key_hint: string | null; key_validated_at: string | null; monthly_cap_usd: number | null; request_cap_usd: number | null;
    }[];
    const wallet = must(await db.from('wallets').select('balance_usd, markup_pct, low_balance_usd').eq('factory_id', factory).maybeSingle(), 'wallets') as
      | { balance_usd: number; markup_pct: number; low_balance_usd: number }
      | null;
    const usage = must(await db.rpc('usage_since', { p_factory: factory, p_since: monthStart(), p_project: null }), 'usage_since') as { cost_usd: number; price_usd: number; calls: number }[];
    console.log(`Agencia ${name} (${factory})`);
    if (settings.length === 0) console.log('  modo: clave de Walt (sin configurar)');
    for (const s of settings) {
      const scope = s.project_id ? `proyecto ${s.project_id}` : 'agencia';
      const key = s.mode === 'byok' ? (s.key_hint ? ` · clave …${s.key_hint}` : ' · ⚠️ sin clave cargada') : '';
      const caps = [s.monthly_cap_usd !== null ? `tope USD ${s.monthly_cap_usd}/mes` : '', s.request_cap_usd !== null ? `USD ${s.request_cap_usd}/pedido` : ''].filter(Boolean).join(', ');
      console.log(`  ${scope}: ${s.mode}${key}${caps ? ` · ${caps}` : ''}`);
    }
    if (wallet) console.log(`  billetera: USD ${Number(wallet.balance_usd).toFixed(2)} (margen ${wallet.markup_pct}%, aviso bajo USD ${wallet.low_balance_usd})`);
    const u = usage[0];
    console.log(`  este mes: ${u?.calls ?? 0} llamadas · costo USD ${Number(u?.cost_usd ?? 0).toFixed(4)} · cobrado USD ${Number(u?.price_usd ?? 0).toFixed(4)}`);
    return;
  }

  if (cmd === 'key') {
    const [action, factory] = [first, second];
    if ((action !== 'set' && action !== 'clear') || !factory) throw new Error('Uso: pnpm ai:key set|clear <factory_id> [--project <id>]');
    const name = await factoryName(db, factory);
    if (action === 'clear') {
      const r = must(await db.rpc('clear_ai_key', { p_factory: factory, p_project: project }), 'clear_ai_key');
      console.log(r ? `🗑️  Clave de ${name} borrada del Vault.` : `${name} no tenía clave cargada.`);
      return;
    }
    const key = await readSecret(`Pegá la clave de Anthropic de ${name} (no se muestra) y Enter: `);
    if (!key) throw new Error('No llegó ninguna clave');
    const models = [...new Set([env.MODEL_INTERPRET, env.MODEL_AGENT])];
    const check = await checkAnthropicKey(key, models);
    if (!check.ok) {
      console.log(`❌ No la guardé: ${KEY_CHECK_TEXT[check.reason]}.`);
      process.exitCode = 2;
      return;
    }
    must(await db.rpc('set_ai_key', { p_factory: factory, p_project: project, p_key: key }), 'set_ai_key');
    console.log(`✅ Clave de ${name} validada (${models.join(' y ')}) y guardada cifrada en el Vault; termina en …${key.slice(-4)}. Modo: byok${project ? ` para el proyecto ${project}` : ''}.`);
    return;
  }

  if (cmd === 'mode') {
    const [factory, mode] = [first, second];
    if (!factory || !MODES.includes(mode as (typeof MODES)[number])) throw new Error(`Uso: pnpm ai:mode <factory_id> ${MODES.join('|')} [--project <id>] [--cap <USD por mes>]`);
    const name = await factoryName(db, factory);
    const existing = must(
      await (project ? db.from('ai_settings').select('id').eq('factory_id', factory).eq('project_id', project) : db.from('ai_settings').select('id').eq('factory_id', factory).is('project_id', null)).maybeSingle(),
      'ai_settings',
    ) as { id: string } | null;
    if (mode === 'walt') {
      if (existing) {
        must(await db.rpc('clear_ai_key', { p_factory: factory, p_project: project }), 'clear_ai_key');
        must(await db.from('ai_settings').delete().eq('id', existing.id), 'ai_settings');
      }
      console.log(`${name}: vuelve a usar la clave de Walt${project ? ` en el proyecto ${project}` : ''}.`);
      return;
    }
    const cap = arg('--cap');
    const values: Record<string, unknown> = { factory_id: factory, project_id: project, mode };
    if (cap !== undefined) values.monthly_cap_usd = cap === 'no' ? null : Number(cap);
    if (existing) must(await db.from('ai_settings').update(values).eq('id', existing.id), 'ai_settings');
    else must(await db.from('ai_settings').insert(values), 'ai_settings');
    const hint = mode === 'byok' ? ' Cargá la clave con pnpm ai:key set.' : mode === 'credits' ? ' Sin saldo no corre: pnpm ai:credit.' : '';
    console.log(`${name}: modo ${mode}${project ? ` en el proyecto ${project}` : ''}.${hint}`);
    return;
  }

  if (cmd === 'credit') {
    const [factory, amount] = [first, second ?? third];
    const usd = Number(amount);
    if (!factory || !Number.isFinite(usd) || usd === 0) throw new Error('Uso: pnpm ai:credit <factory_id> <USD> [--reference <id>]');
    const name = await factoryName(db, factory);
    const reference = arg('--reference') ?? `manual:${randomUUID()}`;
    const r = must(await db.rpc('credit_wallet', { p_factory: factory, p_amount_usd: usd, p_reference: reference, p_kind: usd > 0 ? 'recharge' : 'adjustment' }), 'credit_wallet') as {
      already: boolean;
      balance_usd: number;
    };
    console.log(r.already ? `Esa recarga (${reference}) ya estaba: saldo USD ${Number(r.balance_usd).toFixed(2)}.` : `💳 ${name}: ${usd > 0 ? '+' : ''}USD ${usd} → saldo USD ${Number(r.balance_usd).toFixed(2)}.`);
    return;
  }

  throw new Error('Comandos: pnpm ai:status | ai:key | ai:mode | ai:credit');
});
