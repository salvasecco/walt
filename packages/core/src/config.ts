import { z } from 'zod';
import { getPointer, joinPointer } from './pointer.ts';

/** `dale.config.json` contract (SPEC §6). */
export const DaleConfigSchema = z.object({
  version: z.literal(1),
  content: z.string().min(1),
  schema: z.string().min(1),
  currency: z.string().min(1),
  texts: z.record(z.string().startsWith('/'), z.string()),
  colors: z.record(z.string(), z.string().startsWith('/')),
  products: z
    .object({
      path: z.string().startsWith('/'),
      id: z.string(),
      name: z.string(),
      price: z.string(),
      category: z.string(),
      available: z.string(),
    })
    .optional(),
  banner: z.string().startsWith('/').optional(),
  hours: z.string().startsWith('/').optional(),
  sections: z.string().startsWith('/').optional(),
});
export type DaleConfig = z.infer<typeof DaleConfigSchema>;

export const DAYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
export type Day = (typeof DAYS)[number];

export const BANNER_FIELDS = ['enabled', 'text', 'discountPercent', 'startsAt', 'endsAt'] as const;

export interface InventoryText {
  path: string;
  label: string;
  value: string;
}
export interface InventoryColor {
  token: string;
  path: string;
  value: string;
}
export interface InventoryProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
}
export interface InventoryBanner {
  enabled: boolean;
  text: string;
  discountPercent: number | null;
  startsAt: string | null;
  endsAt: string | null;
}
export interface InventoryHours {
  day: Day;
  open: string | null;
  close: string | null;
}
export interface InventorySection {
  section: string;
  visible: boolean;
}

/** What the model sees: every editable thing with its current value. */
export interface Inventory {
  currency: string;
  texts: InventoryText[];
  colors: InventoryColor[];
  products: InventoryProduct[];
  categories: string[];
  banner: InventoryBanner | null;
  hours: InventoryHours[] | null;
  sections: InventorySection[] | null;
}

export function parseConfig(raw: unknown): DaleConfig {
  return DaleConfigSchema.parse(raw);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function getProducts(config: DaleConfig, content: unknown): Record<string, unknown>[] {
  if (!config.products) return [];
  const list = getPointer(content, config.products.path);
  return Array.isArray(list) ? list.map(asRecord) : [];
}

export function buildInventory(config: DaleConfig, content: unknown): Inventory {
  const texts: InventoryText[] = Object.entries(config.texts).map(([path, label]) => ({
    path,
    label,
    value: String(getPointer(content, path) ?? ''),
  }));
  const colors: InventoryColor[] = Object.entries(config.colors).map(([token, path]) => ({
    token,
    path,
    value: String(getPointer(content, path) ?? ''),
  }));
  const p = config.products;
  const products: InventoryProduct[] = p
    ? getProducts(config, content).map((item) => ({
        id: String(item[p.id]),
        name: String(item[p.name]),
        category: String(item[p.category]),
        price: Number(item[p.price]),
        available: Boolean(item[p.available]),
      }))
    : [];
  const categories = [...new Set(products.map((x) => x.category))];

  let banner: InventoryBanner | null = null;
  if (config.banner) {
    const b = asRecord(getPointer(content, config.banner));
    banner = {
      enabled: Boolean(b.enabled),
      text: typeof b.text === 'string' ? b.text : '',
      discountPercent: typeof b.discountPercent === 'number' ? b.discountPercent : null,
      startsAt: typeof b.startsAt === 'string' ? b.startsAt : null,
      endsAt: typeof b.endsAt === 'string' ? b.endsAt : null,
    };
  }

  let hours: InventoryHours[] | null = null;
  if (config.hours) {
    const h = getPointer(content, config.hours);
    hours = Array.isArray(h)
      ? h.map(asRecord).map((x) => ({
          day: x.day as Day,
          open: typeof x.open === 'string' ? x.open : null,
          close: typeof x.close === 'string' ? x.close : null,
        }))
      : [];
  }

  let sections: InventorySection[] | null = null;
  if (config.sections) {
    sections = Object.entries(asRecord(getPointer(content, config.sections))).map(([section, visible]) => ({
      section,
      visible: Boolean(visible),
    }));
  }

  return { currency: config.currency, texts, colors, products, categories, banner, hours, sections };
}

/**
 * Every JSON pointer that content-mode operations may change. Used by the gate as defense in depth:
 * a change outside this set is blocked even if an operation produced it.
 */
export function inventoryPointers(config: DaleConfig, content: unknown): Set<string> {
  const out = new Set<string>();
  for (const path of Object.keys(config.texts)) out.add(path);
  for (const path of Object.values(config.colors)) out.add(path);
  const p = config.products;
  if (p) {
    const items = getProducts(config, content);
    items.forEach((_, i) => {
      out.add(`${p.path}${joinPointer(i, p.price)}`);
      out.add(`${p.path}${joinPointer(i, p.available)}`);
    });
    // Slots for new products (add_product appends).
    for (let i = items.length; i < items.length + 5; i++) out.add(`${p.path}${joinPointer(i)}`);
  }
  if (config.banner) for (const f of BANNER_FIELDS) out.add(`${config.banner}${joinPointer(f)}`);
  if (config.hours) {
    const h = getPointer(content, config.hours);
    if (Array.isArray(h)) {
      h.forEach((_, i) => {
        out.add(`${config.hours}${joinPointer(i, 'open')}`);
        out.add(`${config.hours}${joinPointer(i, 'close')}`);
      });
    }
  }
  if (config.sections) {
    for (const key of Object.keys(asRecord(getPointer(content, config.sections)))) {
      out.add(`${config.sections}${joinPointer(key)}`);
    }
  }
  return out;
}
