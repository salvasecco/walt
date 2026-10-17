import { z } from 'zod';
import { BANNER_FIELDS, DAYS, getProducts, type DaleConfig } from './config.ts';
import { deepClone, deepEqual, getPointer, hasPointer, joinPointer, setPointer } from './pointer.ts';

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const ROUNDINGS = ['none', 'integer', 'nearest_5', 'nearest_10'] as const;
export type Rounding = (typeof ROUNDINGS)[number];

export const SetTextOp = z.object({ type: z.literal('set_text'), path: z.string(), value: z.string() });
export const SetPriceOp = z.object({ type: z.literal('set_price'), productId: z.string(), value: z.number() });
export const AdjustPricesOp = z
  .object({
    type: z.literal('adjust_prices'),
    filter: z.object({
      all: z.literal(true).optional(),
      category: z.string().optional(),
      productIds: z.array(z.string()).optional(),
    }),
    percent: z.number().optional(),
    amount: z.number().optional(),
    rounding: z.enum(ROUNDINGS),
  })
  .refine((op) => (op.percent === undefined) !== (op.amount === undefined), {
    message: 'adjust_prices necesita percent o amount, nunca los dos',
  })
  .refine((op) => [op.filter.all, op.filter.category, op.filter.productIds].filter((x) => x !== undefined).length === 1, {
    message: 'adjust_prices necesita exactamente un filtro: all, category o productIds',
  });
export const SetAvailabilityOp = z.object({
  type: z.literal('set_availability'),
  productId: z.string(),
  available: z.boolean(),
});
export const SetColorOp = z.object({ type: z.literal('set_color'), token: z.string(), value: z.string() });
export const SetBannerOp = z.object({
  type: z.literal('set_banner'),
  enabled: z.boolean(),
  text: z.string().optional(),
  discountPercent: z.number().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export const SetHoursOp = z.object({
  type: z.literal('set_hours'),
  day: z.enum(DAYS),
  open: z.string().regex(TIME).nullable(),
  close: z.string().regex(TIME).nullable(),
});
export const ToggleSectionOp = z.object({ type: z.literal('toggle_section'), section: z.string(), visible: z.boolean() });

export const OpSchema = z.union([
  SetTextOp,
  SetPriceOp,
  AdjustPricesOp,
  SetAvailabilityOp,
  SetColorOp,
  SetBannerOp,
  SetHoursOp,
  ToggleSectionOp,
]);
export type Op = z.infer<typeof OpSchema>;
export type OpType = Op['type'];

export const OP_TYPES = [
  'set_text',
  'set_price',
  'adjust_prices',
  'set_availability',
  'set_color',
  'set_banner',
  'set_hours',
  'toggle_section',
] as const satisfies readonly OpType[];

/** Human labels in Spanish for each operation type (panel, reasons). */
export const OP_LABELS: Record<OpType, string> = {
  set_text: 'cambiar un texto',
  set_price: 'cambiar un precio',
  adjust_prices: 'ajustar varios precios',
  set_availability: 'cambiar la disponibilidad',
  set_color: 'cambiar un color',
  set_banner: 'poner o sacar un cartel',
  set_hours: 'cambiar horarios',
  toggle_section: 'mostrar u ocultar una sección',
};

export interface Change {
  pointer: string;
  before: unknown;
  after: unknown;
}

/** Validation error with a Spanish, user-facing message. Never ignored. */
export class OpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpValidationError';
  }
}

export function roundPrice(value: number, rounding: Rounding): number {
  const clean = Math.round(value * 100) / 100;
  switch (rounding) {
    case 'none':
      return clean;
    case 'integer':
      return Math.round(clean);
    case 'nearest_5':
      return Math.round(clean / 5) * 5;
    case 'nearest_10':
      return Math.round(clean / 10) * 10;
  }
}

class Recorder {
  private readonly changes = new Map<string, Change>();
  constructor(readonly content: unknown) {}

  set(pointer: string, value: unknown): void {
    if (!hasPointer(this.content, pointer)) throw new OpValidationError(`La ruta ${pointer} no existe en el contenido`);
    const before = getPointer(this.content, pointer);
    if (deepEqual(before, value)) return;
    const prev = this.changes.get(pointer);
    this.changes.set(pointer, { pointer, before: prev ? prev.before : deepClone(before), after: deepClone(value) });
    setPointer(this.content, pointer, deepClone(value));
  }

  list(): Change[] {
    return [...this.changes.values()].filter((c) => !deepEqual(c.before, c.after));
  }
}

function productIndex(config: DaleConfig, content: unknown, productId: string): number {
  const p = config.products;
  if (!p) throw new OpValidationError('Este sitio no tiene productos');
  const idx = getProducts(config, content).findIndex((x) => x[p.id] === productId);
  if (idx < 0) throw new OpValidationError(`No existe el producto "${productId}"`);
  return idx;
}

function productPointer(config: DaleConfig, index: number, field: string): string {
  return `${config.products!.path}${joinPointer(index, field)}`;
}

/**
 * Applies typed operations to a copy of the content. Never mutates the input.
 * Unknown product ids, paths, tokens or sections throw `OpValidationError`.
 */
export function applyOps(content: unknown, ops: Op[], config: DaleConfig): { content: unknown; changes: Change[] } {
  const rec = new Recorder(deepClone(content));
  for (const raw of ops) {
    const parsed = OpSchema.safeParse(raw);
    if (!parsed.success) {
      throw new OpValidationError(`Operación inválida: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    const op = parsed.data;
    switch (op.type) {
      case 'set_text': {
        if (!(op.path in config.texts)) throw new OpValidationError(`El texto ${op.path} no se puede editar`);
        rec.set(op.path, op.value);
        break;
      }
      case 'set_price': {
        const i = productIndex(config, rec.content, op.productId);
        rec.set(productPointer(config, i, config.products!.price), op.value);
        break;
      }
      case 'adjust_prices': {
        const p = config.products;
        if (!p) throw new OpValidationError('Este sitio no tiene productos');
        const items = getProducts(config, rec.content);
        let indexes: number[];
        if (op.filter.all) {
          indexes = items.map((_, i) => i);
        } else if (op.filter.category !== undefined) {
          const cat = op.filter.category;
          indexes = items.flatMap((x, i) => (x[p.category] === cat ? [i] : []));
          if (indexes.length === 0) throw new OpValidationError(`No existe la categoría "${cat}"`);
        } else {
          indexes = (op.filter.productIds ?? []).map((id) => productIndex(config, rec.content, id));
          if (indexes.length === 0) throw new OpValidationError('No se indicó ningún producto');
        }
        for (const i of indexes) {
          const current = Number(items[i]![p.price]);
          const raw = op.percent !== undefined ? current * (1 + op.percent / 100) : current + (op.amount ?? 0);
          const next = roundPrice(raw, op.rounding);
          if (!(next > 0)) {
            throw new OpValidationError(`El precio de "${String(items[i]![p.name])}" quedaría en ${next}`);
          }
          rec.set(productPointer(config, i, p.price), next);
        }
        break;
      }
      case 'set_availability': {
        const i = productIndex(config, rec.content, op.productId);
        rec.set(productPointer(config, i, config.products!.available), op.available);
        break;
      }
      case 'set_color': {
        const path = config.colors[op.token];
        if (!path) throw new OpValidationError(`No existe el color "${op.token}"`);
        rec.set(path, op.value);
        break;
      }
      case 'set_banner': {
        if (!config.banner) throw new OpValidationError('Este sitio no tiene cartel');
        for (const field of BANNER_FIELDS) {
          const value = op[field];
          if (value !== undefined) rec.set(`${config.banner}${joinPointer(field)}`, value);
        }
        break;
      }
      case 'set_hours': {
        if (!config.hours) throw new OpValidationError('Este sitio no tiene horarios');
        const list = getPointer(rec.content, config.hours);
        const idx = Array.isArray(list) ? list.findIndex((h) => (h as { day?: string })?.day === op.day) : -1;
        if (idx < 0) throw new OpValidationError(`No hay horario para el día "${op.day}"`);
        if ((op.open === null) !== (op.close === null)) {
          throw new OpValidationError('Un horario necesita apertura y cierre, o los dos vacíos si cierra');
        }
        rec.set(`${config.hours}${joinPointer(idx, 'open')}`, op.open);
        rec.set(`${config.hours}${joinPointer(idx, 'close')}`, op.close);
        break;
      }
      case 'toggle_section': {
        if (!config.sections) throw new OpValidationError('Este sitio no tiene secciones');
        const pointer = `${config.sections}${joinPointer(op.section)}`;
        if (!hasPointer(rec.content, pointer)) throw new OpValidationError(`No existe la sección "${op.section}"`);
        rec.set(pointer, op.visible);
        break;
      }
    }
  }
  return { content: rec.content, changes: rec.list() };
}

export type RevertResult = { content: unknown; changes: Change[] } | { conflict: string[] };

/**
 * Puts back each `before` if the current value still equals `after`. All or nothing:
 * if anything changed since, returns the conflicting pointers and applies nothing.
 */
export function revertChanges(content: unknown, changes: Change[]): RevertResult {
  const conflict = changes
    .filter((c) => !hasPointer(content, c.pointer) || !deepEqual(getPointer(content, c.pointer), c.after))
    .map((c) => c.pointer);
  if (conflict.length > 0) return { conflict };
  const next = deepClone(content);
  for (const c of changes) setPointer(next, c.pointer, deepClone(c.before));
  return { content: next, changes: changes.map((c) => ({ pointer: c.pointer, before: c.after, after: c.before })) };
}
