import { ext } from './browser';
import type { Catalog, CatalogMeta, ObservedMap, Prefs, Registration, Rule, UsageEvent } from './types';
import { DEFAULT_PREFS } from './types';

export const KEYS = {
  prefs: 'prefs', rules: 'rules', catalog: 'catalog', catalogMeta: 'catalogMeta',
  usage: 'usage', registrations: 'registrations', observed: 'observed',
} as const;

const USAGE_MAX = 2000;

async function get<T>(key: string): Promise<T | undefined> {
  const r = await ext.storage.local.get(key);
  return r?.[key] as T | undefined;
}
async function set(key: string, value: unknown): Promise<void> {
  await ext.storage.local.set({ [key]: value });
}

export async function getPrefs(): Promise<Prefs> {
  const p = await get<Partial<Prefs>>(KEYS.prefs);
  return { ...DEFAULT_PREFS, ...(p ?? {}), services: { ...(p?.services ?? {}) } };
}
export const setPrefs = (p: Prefs) => set(KEYS.prefs, p);

export async function getRules(): Promise<Rule[]> { return (await get<Rule[]>(KEYS.rules)) ?? []; }
export const setRules = (r: Rule[]) => set(KEYS.rules, r);

export const getStoredCatalog = () => get<Catalog>(KEYS.catalog);
export const putCatalog = (c: Catalog) => set(KEYS.catalog, c);
export async function getCatalogMeta(): Promise<CatalogMeta> {
  return (await get<CatalogMeta>(KEYS.catalogMeta)) ?? { source: 'bundled' };
}
export const setCatalogMeta = (m: CatalogMeta) => set(KEYS.catalogMeta, m);
export async function clearCatalog(): Promise<void> {
  await ext.storage.local.remove([KEYS.catalog, KEYS.catalogMeta]);
}

export async function getUsage(): Promise<UsageEvent[]> { return (await get<UsageEvent[]>(KEYS.usage)) ?? []; }
export async function appendUsage(e: UsageEvent): Promise<void> {
  const all = await getUsage();
  all.push(e);
  if (all.length > USAGE_MAX) all.splice(0, all.length - USAGE_MAX);
  await set(KEYS.usage, all);
}
export const clearUsage = () => set(KEYS.usage, []);

export async function getRegistrations(): Promise<Registration[]> {
  return (await get<Registration[]>(KEYS.registrations)) ?? [];
}
export const setRegistrations = (r: Registration[]) => set(KEYS.registrations, r);

export async function getObserved(): Promise<ObservedMap> { return (await get<ObservedMap>(KEYS.observed)) ?? {}; }
export const setObserved = (o: ObservedMap) => set(KEYS.observed, o);

export function onChanged(cb: (keys: string[]) => void): void {
  ext.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
    if (area === 'local') cb(Object.keys(changes));
  });
}
