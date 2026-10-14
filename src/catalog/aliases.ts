import type { Catalog } from '../shared/types';

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, ' ').trim();

/** Map a picker label (as displayed on the site) to a catalog model id. */
export function resolveModelLabel(catalog: Catalog, serviceId: string, label: string | null | undefined): string | null {
  if (!label) return null;
  const text = norm(label);
  if (!text) return null;
  const svc = catalog.services[serviceId];
  const entries = svc?.models ?? [];
  // 1. exact label
  for (const m of entries) if (norm(m.label) === text) return m.modelId;
  // 2. label or alias contained in the text, longest first (so "Sonnet 4.5" beats "Sonnet")
  const pairs: [string, string][] = [];
  for (const m of entries) {
    pairs.push([norm(m.label), m.modelId]);
    for (const a of m.aliases ?? []) pairs.push([norm(a), m.modelId]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  for (const [needle, id] of pairs) if (needle && text.includes(needle)) return id;
  // 3. global model names
  const globals = Object.entries(catalog.models).map(([id, m]) => [norm(m.name), id] as [string, string])
    .sort((a, b) => b[0].length - a[0].length);
  for (const [needle, id] of globals) if (needle && text.includes(needle)) return id;
  return null;
}

/**
 * Resolve a picker label to the option key: the model id, plus "@effort" when the label names an effort level the
 * model offers (Claude's button reads "Opus 5.5 Max"). Without an effort word the service's first listed level that
 * the model offers is not assumed: the plain model id is returned, and callers treat it as "effort unknown".
 */
export function resolveOptionKey(catalog: Catalog, serviceId: string, label: string | null | undefined): string | null {
  const modelId = resolveModelLabel(catalog, serviceId, label);
  if (!modelId || !label) return modelId;
  const svc = catalog.services[serviceId];
  const sm = svc?.models.find(m => m.modelId === modelId);
  const words = ` ${norm(label)} `;
  const levels = (sm?.efforts ?? []).map(id => svc?.efforts?.find(e => e.id === id)).filter(Boolean) as NonNullable<NonNullable<typeof svc>['efforts']>;
  // Longest effort words first, so "extra high" beats "high".
  const pairs = levels.flatMap(e => [e.label, ...(e.aliases ?? [])].map(w => [norm(w), e.id] as [string, string])).sort((a, b) => b[0].length - a[0].length);
  for (const [w, id] of pairs) if (w && words.includes(` ${w} `)) return `${modelId}@${id}`;
  return modelId;
}

/** True when an option key (model or model@effort) refers to the given candidate key, treating a bare model id as matching any of its efforts. */
export function sameOption(current: string | undefined, key: string): boolean {
  if (!current) return false;
  return current === key || (!current.includes('@') && key.startsWith(current + '@'));
}

/** Every alias across all services, for the generic adapter's picker sniffing. */
export function allAliases(catalog: Catalog): string[] {
  const out = new Set<string>();
  for (const s of Object.values(catalog.services)) {
    for (const m of s.models) { out.add(m.label); for (const a of m.aliases ?? []) out.add(a); }
  }
  for (const m of Object.values(catalog.models)) out.add(m.name);
  return [...out].filter(Boolean);
}
