import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_PROMPT_EXAMPLES, type Inventory, type LabeledExample, type Turn } from '@walt/core';

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

/** Removes a block's own opening and closing tags from a value, so data never closes the block it sits in. */
export function neutralize(tag: string, text: string): string {
  return text.replace(new RegExp(`</?\\s*${tag}\\s*>`, 'gi'), '');
}

/** The agency's policy and its "always new" list, as one data block for the prompt. Empty when there is none. */
export function formatPolicy(policyText: string | undefined, alwaysNew: readonly string[] = []): string {
  const parts: string[] = [];
  const text = (policyText ?? '').trim();
  if (text) parts.push(text.slice(0, 4_000));
  const list = alwaysNew.map((x) => x.trim()).filter(Boolean).slice(0, 30);
  if (list.length) parts.push(['Siempre son algo nuevo:', ...list.map((x) => `- ${x.slice(0, 200)}`)].join('\n'));
  if (!parts.length) return '';
  return `<politica_agencia>\n${neutralize('politica_agencia', parts.join('\n\n'))}\n</politica_agencia>`;
}

/** Relabeled requests of the same agency, as one data block. Empty when there are none. */
export function formatExamples(examples: readonly LabeledExample[] = []): string {
  const list = examples.slice(0, MAX_PROMPT_EXAMPLES).map((e) => {
    const text = e.text.replace(/\s+/g, ' ').trim().slice(0, 300);
    const before = e.previous && e.previous !== e.category ? ` (antes se había clasificado como ${e.previous})` : '';
    const reason = e.reason?.trim() ? `. Motivo: ${e.reason.replace(/\s+/g, ' ').trim().slice(0, 200)}` : '';
    return `- «${text}» → ${e.category}${before}${reason}`;
  });
  if (!list.length) return '';
  return `<ejemplos_agencia>\n${neutralize('ejemplos_agencia', list.join('\n'))}\n</ejemplos_agencia>`;
}
