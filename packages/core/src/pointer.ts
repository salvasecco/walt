/** Minimal RFC 6901 JSON Pointer helpers. */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Puntero inválido: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function joinPointer(...parts: (string | number)[]): string {
  return parts.map((p) => '/' + String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}

export function hasPointer(doc: unknown, pointer: string): boolean {
  let cur: unknown = doc;
  for (const key of parsePointer(pointer)) {
    if (cur === null || typeof cur !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  return true;
}

export function getPointer(doc: unknown, pointer: string): unknown {
  let cur: unknown = doc;
  for (const key of parsePointer(pointer)) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Sets a value at an existing parent. Throws if the parent path does not exist. */
export function setPointer(doc: unknown, pointer: string, value: unknown): void {
  const keys = parsePointer(pointer);
  const last = keys.pop();
  if (last === undefined) throw new Error('No se puede reemplazar la raíz');
  let cur: unknown = doc;
  for (const key of keys) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) {
      throw new Error(`La ruta ${pointer} no existe`);
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur === null || typeof cur !== 'object') throw new Error(`La ruta ${pointer} no existe`);
  (cur as Record<string, unknown>)[last] = value;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  return ak.length === bk.length && ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}
