import bundled from './catalog.json';
import type { Candidate, Catalog, ObservedMap, Prefs } from '../shared/types';
import { validateCatalog } from './schema';

export const BUNDLED: Catalog = validateCatalog(bundled);

export function serviceForHost(catalog: Catalog, hostname: string): string | null {
  const h = hostname.toLowerCase();
  for (const [id, s] of Object.entries(catalog.services)) {
    if (s.hosts.some(x => h === x || h.endsWith('.' + x))) return id;
  }
  return null;
}

/**
 * Candidates a service offers, annotated with the user's plan on that service.
 * A model seen in the site's own picker (`observed`) counts as included in the
 * user's plan even when the catalog's plan list says otherwise.
 */
export function candidatesFor(catalog: Catalog, serviceId: string, prefs: Prefs, observed: ObservedMap = {}): Candidate[] {
  const svc = catalog.services[serviceId];
  if (!svc) return [];
  const plan = prefs.services[serviceId]?.plan;
  const seen = new Set(observed[serviceId]?.models ?? []);
  const out: Candidate[] = [];
  const efforts = new Map((svc.efforts ?? []).map(e => [e.id, e]));
  for (const m of svc.models) {
    const model = catalog.models[m.modelId];
    if (!model) continue;
    const inPlan = plan !== undefined && ((m.plans ?? []).includes(plan) || seen.has(m.modelId));
    const base = { modelId: m.modelId, serviceId, model, plan: inPlan ? plan : undefined };
    const levels = (m.efforts ?? []).map(id => efforts.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (!levels.length) {
      out.push({ ...base, key: m.modelId, label: m.label, capWeight: inPlan ? m.capWeight : undefined });
      continue;
    }
    for (const e of levels) {
      const capWeight = inPlan && m.capWeight !== undefined ? m.capWeight * (e.capMultiplier ?? e.outputMultiplier) : undefined;
      out.push({ ...base, key: `${m.modelId}@${e.id}`, label: `${m.label} · ${e.label}`, effort: e, capWeight });
    }
  }
  return out;
}

/** Candidates from every other service the user enabled for cross-service suggestions. */
export function candidatesElsewhere(catalog: Catalog, hereId: string, prefs: Prefs, observed: ObservedMap = {}): Candidate[] {
  const out: Candidate[] = [];
  for (const id of Object.keys(catalog.services)) {
    if (id === hereId || !prefs.services[id]?.enabled) continue;
    out.push(...candidatesFor(catalog, id, prefs, observed));
  }
  return out;
}
