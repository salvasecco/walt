/**
 * Minimal glob matcher, browser-safe (no `node:`), for the delicate/protected/simple path rules.
 * Supports `**` (any number of directories), `*` and `?` (never across `/`), `{a,b}` and `[abc]`.
 * Matching is case-insensitive and `*` also matches dotfiles: for deciding what is delicate,
 * matching more is the safe side.
 */

const cache = new Map<string, RegExp>();

const SPECIAL = /[.+^$()|\\/]/;

export function globToRegExp(glob: string): RegExp {
  const key = glob.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const g = normalizePath(key);
  let re = '';
  let braces = 0;
  for (let i = 0; i < g.length; ) {
    const c = g[i]!;
    if (c === '*') {
      if (g[i + 1] === '*') {
        const atStart = i === 0 || g[i - 1] === '/';
        if (atStart && g[i + 2] === '/') {
          re += '(?:.*/)?'; // `**/`: zero or more directories
          i += 3;
        } else {
          re += '.*'; // `/**` at the end, or `**` inside a segment: anything below
          i += 2;
        }
        continue;
      }
      re += '[^/]*';
      i++;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i++;
      continue;
    }
    if (c === '{') {
      braces++;
      re += '(?:';
      i++;
      continue;
    }
    if (c === '}' && braces > 0) {
      braces--;
      re += ')';
      i++;
      continue;
    }
    if (c === ',' && braces > 0) {
      re += '|';
      i++;
      continue;
    }
    if (c === '[') {
      const end = g.indexOf(']', i + 1);
      if (end > i + 1) {
        const body = g.slice(i + 1, end).replace(/\\/g, '\\\\');
        re += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        i = end + 1;
        continue;
      }
    }
    re += SPECIAL.test(c) || c === '{' || c === '}' || c === '[' || c === ']' ? `\\${c}` : c;
    i++;
  }
  const out = new RegExp(`^${re}$`);
  cache.set(key, out);
  return out;
}

/** `./a\\b` → `a/b`: forward slashes, no leading `./` or `/`. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

export function matchGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(normalizePath(path).toLowerCase());
}

/** The first glob of the list that matches the path, if any. */
export function firstMatch(path: string, globs: readonly string[]): string | undefined {
  return globs.find((g) => matchGlob(path, g));
}
