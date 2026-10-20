// Taxonomía de pedidos del R1 (docs/R1-CONTRATO.md). Funciones puras, sin Supabase ni React.
// Mientras la migración de datos no esté aplicada, la base puede traer los valores viejos:
// permitido → simple, riesgoso → delicado, fuera_de_alcance → nuevo. El panel muestra siempre los nuevos.
// Es la misma lógica que `normalizeCategory` de @walt/core, repetida acá (atada por tipos) para no meter
// zod y todo core en el bundle del navegador.
import type { Category as CoreCategory, LegacyCategory as CoreLegacy } from "@walt/core/browser";

/** En el orden en que el panel los muestra. */
export const CATEGORIES = ["simple", "delicado", "nuevo", "consulta", "bloqueado", "charla", "derivado"] as const satisfies readonly CoreCategory[];
export type Category = (typeof CATEGORIES)[number];

export const LEGACY_CATEGORIES = ["permitido", "riesgoso", "fuera_de_alcance"] as const satisfies readonly CoreLegacy[];
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

// Si core suma una categoría, esto deja de compilar hasta que el panel la conozca.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameCategories: Same<Category, CoreCategory> = true;
const _sameLegacy: Same<LegacyCategory, CoreLegacy> = true;
void _sameCategories;
void _sameLegacy;

/** Lo que puede venir en `requests.category`, antes o después de la migración. */
export type StoredCategory = Category | LegacyCategory;

/** Las que la agencia elige al reetiquetar. `charla` y `derivado` son internas. */
export const LABEL_CATEGORIES = ["simple", "delicado", "nuevo", "consulta", "bloqueado"] as const;
export type LabelCategory = (typeof LABEL_CATEGORIES)[number];

export const LEGACY_TO_NEW: Record<LegacyCategory, Category> = {
  permitido: "simple",
  riesgoso: "delicado",
  fuera_de_alcance: "nuevo",
};

/** Categoría con el nombre nuevo; null si no tiene o si el valor es desconocido. */
export function normalizeCategory(c: string | null | undefined): Category | null {
  if (!c) return null;
  if ((CATEGORIES as readonly string[]).includes(c)) return c as Category;
  if (c in LEGACY_TO_NEW) return LEGACY_TO_NEW[c as LegacyCategory];
  return null;
}

export function isCategory(c: unknown): c is Category {
  return typeof c === "string" && (CATEGORIES as readonly string[]).includes(c);
}

export function isLabelCategory(c: unknown): c is LabelCategory {
  return typeof c === "string" && (LABEL_CATEGORIES as readonly string[]).includes(c);
}

/** Valores a buscar en la base para una categoría nueva: el nuevo y el viejo equivalente, si hay. */
export function categoryVariants(c: Category): StoredCategory[] {
  const old = (Object.keys(LEGACY_TO_NEW) as LegacyCategory[]).filter((k) => LEGACY_TO_NEW[k] === c);
  return [c, ...old];
}

/** Estados en los que un pedido espera una decisión de la agencia. */
export const AGENCY_WAIT_STATUSES = ["esperando_agencia", "agente_listo"] as const;

/**
 * Pendiente de la agencia: espera su aprobación y es delicado. Lo simple nunca pasa por la agencia,
 * aunque toque código (brief §1); si un pedido simple quedó en uno de esos estados, no se muestra como pendiente.
 */
export function isPendingAgency(r: { status: string; category: string | null }): boolean {
  return (AGENCY_WAIT_STATUSES as readonly string[]).includes(r.status) && normalizeCategory(r.category) === "delicado";
}

/** Resuelto sin la agencia: simple, consulta, charla y bloqueado (no se aplica nada y se avisa). */
export function resolvedWithoutAgency(c: string | null | undefined): boolean {
  const n = normalizeCategory(c);
  return n === "simple" || n === "consulta" || n === "charla" || n === "bloqueado";
}

/** Pedidos que cuentan para medir la clasificación: los que tienen una categoría que la agencia puede corregir. */
export function isDecided(c: string | null | undefined): boolean {
  const n = normalizeCategory(c);
  return n !== null && isLabelCategory(n);
}
