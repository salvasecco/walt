import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Inventory, Turn } from '@dale/core';

const DIR = fileURLToPath(new URL('../prompts/', import.meta.url));
const cache = new Map<string, string>();

export type PromptName = 'interpret' | 'consulta' | 'presupuesto';

/** Versioned prompts live in `packages/ai/prompts/*.md`; the leading HTML comment is dropped. */
export function loadPrompt(name: PromptName): string {
  let p = cache.get(name);
  if (!p) {
    p = readFileSync(`${DIR}${name}.md`, 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '').trim();
    cache.set(name, p);
  }
  return p;
}

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Compact, readable inventory for the model: ids, paths and current values. */
export function formatInventory(inv: Inventory): string {
  const lines: string[] = [`moneda: ${inv.currency}`];
  if (inv.texts.length) {
    lines.push('texts (path · etiqueta · valor actual):');
    for (const t of inv.texts) lines.push(`  ${t.path} · ${t.label} · ${JSON.stringify(t.value)}`);
  }
  if (inv.colors.length) {
    lines.push('colors (token · valor actual):');
    for (const c of inv.colors) lines.push(`  ${c.token} · ${c.value}`);
  }
  if (inv.products.length) {
    lines.push('products (id · nombre · categoría · precio · disponible):');
    for (const p of inv.products) lines.push(`  ${p.id} · ${p.name} · ${p.category} · ${money(p.price)} · ${p.available ? 'sí' : 'no'}`);
    lines.push(`categorías: ${inv.categories.join(', ')}`);
  }
  if (inv.banner) {
    const b = inv.banner;
    lines.push(
      `banner: ${b.enabled ? 'activo' : 'apagado'} · texto ${JSON.stringify(b.text)} · descuento ${b.discountPercent ?? 'ninguno'} · desde ${b.startsAt ?? '—'} · hasta ${b.endsAt ?? '—'}`,
    );
  }
  if (inv.hours) {
    lines.push('hours:');
    for (const h of inv.hours) lines.push(`  ${h.day} · ${h.open && h.close ? `${h.open}–${h.close}` : 'cerrado'}`);
  }
  if (inv.sections) {
    lines.push(`sections: ${inv.sections.map((s) => `${s.section} (${s.visible ? 'visible' : 'oculta'})`).join(', ')}`);
  }
  return lines.join('\n');
}

export function formatHistory(history: Turn[]): string {
  if (history.length === 0) return '(sin mensajes anteriores)';
  return history
    .slice(-10)
    .map((t) => `${t.role}: ${t.text.slice(0, 500)}`)
    .join('\n');
}
