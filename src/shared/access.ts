// Site access. Chrome and Firefox 127+ grant the manifest's host permissions at
// install, but Firefox lets the user switch each site off later from the
// extensions menu. These helpers find supported chat sites that lack access, so
// the options page can offer one "Allow" button to restore them.
import type { Catalog } from './types';

export interface PermissionsApi {
  contains(p: { origins: string[] }): Promise<boolean>;
  request(p: { origins: string[] }): Promise<boolean>;
}

/** Match patterns for every host of every service in the catalog. */
export function supportedOrigins(catalog: Catalog): string[] {
  const out = new Set<string>();
  for (const s of Object.values(catalog.services)) for (const h of s.hosts) out.add(`https://${h}/*`);
  return [...out];
}

/** Origins the extension may not run on yet. A failing API counts as granted (nothing we can do). */
export async function missingOrigins(catalog: Catalog, perms: PermissionsApi): Promise<string[]> {
  const origins = supportedOrigins(catalog);
  const checks = await Promise.all(origins.map(o => perms.contains({ origins: [o] }).catch(() => true)));
  return origins.filter((_, i) => !checks[i]);
}

/** Ask for every missing origin in one browser prompt. Must run inside a click handler. */
export async function requestMissing(catalog: Catalog, perms: PermissionsApi): Promise<boolean> {
  const missing = await missingOrigins(catalog, perms);
  if (!missing.length) return true;
  return perms.request({ origins: missing }).catch(() => false);
}
