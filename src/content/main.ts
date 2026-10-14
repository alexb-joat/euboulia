import { BUNDLED, serviceForHost } from '../catalog/index';
import { resolveModelLabel } from '../catalog/aliases';
import {
  getObserved, getPrefs, getRegistrations, getRules, getStoredCatalog, getUsage, onChanged, setObserved,
} from '../shared/storage';
import type { Catalog, ObservedMap, Prefs, Rule, UsageEvent } from '../shared/types';
import type { ComposerHandle, SiteAdapter } from '../sites/adapter';
import { allAdapters, pickAdapter } from '../sites/registry';
import { Cloud } from './cloud';
import { ComposerRegistry } from './registry';
import { readTheme, watchTheme } from './theme';
import { ComposerWatcher, type Shared } from './watcher';

declare const __DEV__: boolean;

const OBSERVE_MIN = 2;   // picker items that must resolve to catalog models before we trust the menu

/** A self-hosted origin the user registered with a specific adapter wins over host detection. */
async function registeredAdapter(catalog: Catalog): Promise<SiteAdapter | undefined> {
  const regs = await getRegistrations().catch(() => []);
  const here = `${location.protocol}//${location.host}/*`;
  const reg = regs.find(r => r.pattern === here);
  if (!reg || reg.adapter === 'generic') return undefined;
  return allAdapters({ catalog }).find(a => a.id === reg.adapter);
}

async function main(): Promise<void> {
  if ((window as any).__euboulia) return;   // injected twice (e.g. registered + static)
  (window as any).__euboulia = true;

  let catalog: Catalog = (await getStoredCatalog().catch(() => undefined)) ?? BUNDLED;
  let prefs: Prefs = await getPrefs();
  let rules: Rule[] = await getRules();
  const observed: ObservedMap = await getObserved().catch(() => ({}));
  const usage: UsageEvent[] = await getUsage().catch(() => []);

  // Dev builds honour <meta name="euboulia-service" content="claude"> so fixture
  // pages on localhost exercise a real site adapter.
  const forced = __DEV__ ? document.querySelector('meta[name="euboulia-service"]')?.getAttribute('content') : null;
  const adapter = (forced && allAdapters({ catalog }).find(a => a.id === forced))
    || await registeredAdapter(catalog)
    || pickAdapter({ catalog });
  const serviceId = forced ?? serviceForHost(catalog, location.hostname) ?? adapter.id;
  const shared: Shared = {
    catalog, prefs, rules, adapter, serviceId, observed, usage,
    cloud: new Cloud(readTheme(document.body), prefs.cloudCollapsedByDefault),
  };

  // When the site's model picker is open, remember which catalog models it lists:
  // those are available on the user's plan even if the bundled plan table disagrees.
  const observePicker = (composers: ComposerHandle[]): void => {
    const c = composers[0];
    if (!c || !(serviceId in shared.catalog.services)) return;
    const ids = new Set<string>();
    for (const o of adapter.models(c)) {
      const id = resolveModelLabel(shared.catalog, serviceId, o.label);
      if (id) ids.add(id);
    }
    if (ids.size < OBSERVE_MIN) return;
    const prev = new Set(shared.observed[serviceId]?.models ?? []);
    const merged = [...new Set([...prev, ...ids])];
    if (merged.length === prev.size) return;
    shared.observed = { ...shared.observed, [serviceId]: { models: merged, at: new Date().toISOString() } };
    setObserved(shared.observed).catch(() => {});
    registry.forEach(w => w.reanalyse());
  };

  const registry = new ComposerRegistry<ComposerWatcher>(adapter, {
    attach: c => new ComposerWatcher(c, shared),
    detach: w => w.destroy(),
    scanned: composers => { observePicker(composers); registry?.forEach(w => w.badge.place()); },
  });
  registry.start();

  watchTheme(() => registry.forEach(w => w.refreshTheme()));

  onChanged(async keys => {
    if (keys.includes('catalog')) shared.catalog = (await getStoredCatalog()) ?? BUNDLED;
    if (keys.includes('prefs')) shared.prefs = await getPrefs();
    if (keys.includes('rules')) shared.rules = await getRules();
    if (keys.includes('observed')) shared.observed = await getObserved();
    if (keys.includes('usage')) { shared.usage = await getUsage(); return; }   // our own send; no re-analysis needed
    registry.forEach(w => w.reanalyse());
  });

  if (__DEV__) (window as any).__eubouliaRegistry = registry;
}

main().catch(e => console.warn('[euboulia]', e));
