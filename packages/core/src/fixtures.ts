import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseConfig, type DaleConfig } from './config.ts';

const dir = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const read = (name: string): unknown => JSON.parse(readFileSync(dir + name, 'utf8'));

/** Panadería Mabel content (SPEC §14). Returns a fresh copy each call. */
export function bakeryContent(): BakeryContent {
  return read('site.json') as BakeryContent;
}
/** `dale.config.json` of the bakery (SPEC §6). */
export function bakeryConfig(): DaleConfig {
  return parseConfig(read('dale.config.json'));
}
/** JSON Schema (draft 2020-12) of the bakery content. */
export function bakerySchema(): object {
  return read('site.schema.json') as object;
}

export const FIXTURES_DIR = dir;

export interface BakeryContent {
  brand: { name: string; tagline: string };
  theme: { primary: string; accent: string; background: string; text: string; title?: string; button?: string; buttonText?: string };
  hero: { title: string; subtitle: string; cta: string };
  banner: { enabled: boolean; text: string; discountPercent: number | null; startsAt: string | null; endsAt: string | null };
  products: { id: string; name: string; category: string; price: number; available: boolean }[];
  hours: { day: string; open: string | null; close: string | null }[];
  headings?: Record<'products' | 'hours' | 'contact', { title: string; subtitle: string }>;
  about: { title: string; text: string };
  contact: { whatsapp: string; address: string; instagram: string };
  sections: Record<string, boolean>;
}
