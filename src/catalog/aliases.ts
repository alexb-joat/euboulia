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

/** Every alias across all services, for the generic adapter's picker sniffing. */
export function allAliases(catalog: Catalog): string[] {
  const out = new Set<string>();
  for (const s of Object.values(catalog.services)) {
    for (const m of s.models) { out.add(m.label); for (const a of m.aliases ?? []) out.add(a); }
  }
  for (const m of Object.values(catalog.models)) out.add(m.name);
  return [...out].filter(Boolean);
}
