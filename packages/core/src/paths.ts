import { firstMatch, normalizePath } from './globs.ts';
import type { RulesConfig } from './rules.ts';
import { ALWAYS_DELICATE_GLOBS } from './templates.ts';

/**
 * Deterministic half of the double classification (brief §1): which of the paths a change touches are
 * delicate. Order: the agency's protected globs, then the floor (`ALWAYS_DELICATE_GLOBS`, it can't be
 * turned off), then the agency's simple globs as exceptions, then its delicate globs. Pure and
 * browser-safe, so the panel's simulator can explain it too.
 */

export type PathZone = 'protegido' | 'base' | 'agencia';

export interface DelicatePath {
  path: string;
  /** The glob that matched. */
  glob: string;
  /** protegido: the agency's protected globs; base: the floor; agencia: the agency's delicate globs. */
  zone: PathZone;
}

export function delicatePaths(paths: readonly string[], config: Pick<RulesConfig, 'delicateGlobs' | 'protectedGlobs' | 'simpleGlobs'>): DelicatePath[] {
  const out: DelicatePath[] = [];
  for (const raw of paths) {
    const path = normalizePath(raw);
    if (!path) continue;
    const prot = firstMatch(path, config.protectedGlobs);
    if (prot) {
      out.push({ path, glob: prot, zone: 'protegido' });
      continue;
    }
    const base = firstMatch(path, ALWAYS_DELICATE_GLOBS);
    if (base) {
      out.push({ path, glob: base, zone: 'base' });
      continue;
    }
    if (firstMatch(path, config.simpleGlobs)) continue;
    const agency = firstMatch(path, config.delicateGlobs);
    if (agency) out.push({ path, glob: agency, zone: 'agencia' });
  }
  return out;
}

/** One Spanish reason per delicate path, for the agency and the panel. */
export function delicatePathReason(p: DelicatePath): string {
  switch (p.zone) {
    case 'protegido':
      return `Toca ${p.path}, que la agencia marcó como protegido (${p.glob})`;
    case 'base':
      return `Toca ${p.path}: ${baseZoneLabel(p.glob)}`;
    case 'agencia':
      return `Toca ${p.path}, una zona delicada de las reglas del proyecto (${p.glob})`;
  }
}

/** What kind of delicate zone a floor glob is, in plain Spanish. */
export function baseZoneLabel(glob: string): string {
  const g = glob.toLowerCase();
  if (/migration|\.sql|prisma|drizzle|seed/.test(g)) return 'la base de datos';
  if (/env|pem|key|secret|credential/.test(g)) return 'secretos o variables de entorno';
  if (/package|lock|shrinkwrap|pnpm|yarn|npmrc|composer|gemfile|requirements|pyproject|poetry|pipfile|go\.|cargo|bun/.test(g)) return 'las dependencias';
  if (/github|gitlab|circleci|bitbucket|azure|jenkins/.test(g)) return 'el CI';
  if (/auth|middleware|proxy|permission|rbac|rules/.test(g)) return 'el login, los permisos o el acceso';
  return 'la infraestructura o el hosting';
}
