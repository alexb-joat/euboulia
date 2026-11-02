// The rules behind the daily catalog refresh, without I/O so they can be tested. compareCatalogs says what a new build
// changes and which of those changes a person should look at first; factsDrift says where the providers' docs, as
// crawled, disagree with the hand-checked provider-facts.json.
const PRICE_JUMP = 0.5;    // a price moving by more than half is more often a bad read than a real change...
const PRICE_FLOOR = 0.1;   // ...unless it moves by less than 10 cents per million tokens: prices are rounded to the cent
const DRIFT_FIELDS = ['price', 'context', 'maxOutput', 'status', 'retiresAt', 'efforts'];

const canon = v => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const same = (a, b) => canon(a) === canon(b);
const short = v => { const s = canon(v) ?? 'none'; return s.length > 60 ? `${s.slice(0, 57)}...` : s; };
const fieldsOf = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])];

/** generatedAt and sources (every build re-dates what it read) never count as news, so a quiet day publishes nothing. */
export function compareCatalogs(prev, next) {
  const changes = [], holds = [];
  const prevModels = prev.models ?? {}, nextModels = next.models ?? {};
  const prevServices = prev.services ?? {}, nextServices = next.services ?? {};
  if (!same(prev.factsGeneratedAt, next.factsGeneratedAt)) changes.push(`provider facts dated ${next.factsGeneratedAt}`);

  for (const id of Object.keys(prevModels)) if (!nextModels[id]) holds.push(`${id}: gone from the catalog`);
  for (const [id, m] of Object.entries(nextModels)) {
    const p = prevModels[id];
    if (!p) { changes.push(`${id}: new`); continue; }
    for (const k of fieldsOf(p, m)) if (k !== 'sources' && !same(p[k], m[k])) changes.push(`${id}: ${k} ${short(p[k])} -> ${short(m[k])}`);
    if (!same(p.strengths, m.strengths)) holds.push(`${id}: strengths changed, which reorders the suggestions`);
    for (const side of ['input', 'output']) {
      const a = p.price?.[side], b = m.price?.[side];
      if (!(a > 0) || a === b) continue;
      if (!(b > 0)) holds.push(`${id}: ${side} price ${a} -> ${b ?? 'none'}`);
      else if (Math.abs(b - a) > PRICE_FLOOR && Math.abs(b - a) / a > PRICE_JUMP) holds.push(`${id}: ${side} price ${a} -> ${b}, a move of more than half`);
    }
  }

  for (const sid of Object.keys(prevServices)) if (!nextServices[sid]) holds.push(`service ${sid}: gone from the catalog`);
  for (const [sid, s] of Object.entries(nextServices)) {
    const p = prevServices[sid];
    if (!p) { changes.push(`service ${sid}: new`); continue; }
    const offered = new Set((s.models ?? []).map(x => x.modelId));
    for (const x of p.models ?? []) if (!offered.has(x.modelId)) holds.push(`service ${sid}: no longer offers ${x.modelId}`);
    for (const k of fieldsOf(p, s)) if (!same(p[k], s[k])) changes.push(`service ${sid}: ${k} changed`);
  }
  return { changes, holds };
}

/** Only providers the crawler covers, and only fields it states: a gap in the crawl is not a disagreement. */
export function factsDrift(facts, docs) {
  const lines = [];
  for (const [prov, d] of Object.entries(docs.providers ?? {})) {
    const known = facts.providers?.[prov]?.models ?? {}, read = d.models ?? {};
    for (const [id, m] of Object.entries(read)) {
      if (!known[id]) { lines.push(`${id}: in the ${prov} docs, not in provider-facts`); continue; }
      for (const f of DRIFT_FIELDS) {
        if (m[f] !== undefined && m[f] !== null && !same(known[id][f], m[f])) lines.push(`${id}: ${f} is ${short(known[id][f])} in provider-facts, ${short(m[f])} in the docs`);
      }
    }
    for (const id of Object.keys(known)) if (!read[id]) lines.push(`${id}: in provider-facts, gone from the ${prov} docs`);
  }
  return lines;
}
