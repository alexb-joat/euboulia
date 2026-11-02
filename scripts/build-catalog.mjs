// Build src/catalog/catalog.json from three inputs:
//   services.json          hosts, selectors, plans, picker labels (hand-maintained)
//   provider-facts.json    prices, context, status, effort levels read from the providers' own
//                          documentation, each figure with its source (hand-entered today; the
//                          Ninshubur crawler's `export euboulia-facts` produces the same file)
//   OpenRouter models API  capabilities and benchmark indexes (strength heuristics), and prices or
//                          context for models the facts file does not cover
// Facts win over OpenRouter wherever both have a value.
//   node scripts/build-catalog.mjs [--from models.json] [--facts provider-facts.json] [--keep-strengths]
//                                  [--out catalog.json] [--previous catalog.json]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : path.join(root, 'src/catalog/catalog.json');
const prevIdx = args.indexOf('--previous');
const previousFile = prevIdx !== -1 ? args[prevIdx + 1] : outFile;
const OPENROUTER = 'https://openrouter.ai/api/v1/models';
const today = new Date().toISOString().slice(0, 10);
// A model whose exact shutdown date (YYYY-MM-DD) has passed is published as retired, so extension versions that
// only read `status` stop offering it after the next rebuild. "not before …" dates are earliest dates and never count.
const statusOn = (m) => (m?.retiresAt && /^\d{4}-\d{2}-\d{2}$/.test(m.retiresAt) && m.retiresAt <= today ? 'retired' : m?.status);

const services = JSON.parse(await readFile(path.join(root, 'src/catalog/services.json'), 'utf8')).services;
const factsIdx = args.indexOf('--facts');
const factsFile = factsIdx !== -1 ? args[factsIdx + 1] : path.join(root, 'src/catalog/provider-facts.json');
const facts = JSON.parse(await readFile(factsFile, 'utf8'));
if (facts.schemaVersion !== 1 || !facts.providers) throw new Error('provider-facts.json: unexpected shape');
const factFor = id => { for (const prov of Object.values(facts.providers)) if (prov.models?.[id]) return { prov, m: prov.models[id] }; return null; };
let raw;
if (fromIdx !== -1) raw = JSON.parse(await readFile(args[fromIdx + 1], 'utf8')).data;
else {
  try { raw = (await (await fetch(OPENROUTER, { signal: AbortSignal.timeout(60_000) })).json()).data; }
  catch (e) { console.error(`cannot read ${OPENROUTER}: ${e.cause?.code ?? e.message}. Try again, or use --from models.json.`); process.exit(1); }
}
if (!Array.isArray(raw)) throw new Error('unexpected OpenRouter payload');
const byId = new Map(raw.map(m => [m.id, m]));

// Benchmark indexes come and go in OpenRouter's feed. When a model has none this time, keep the strengths the
// previous catalog had for it instead of falling back to defaults, and say so; defaults would quietly reshuffle
// the suggestions.
let previous = {};
try { previous = JSON.parse(await readFile(previousFile, 'utf8')).models ?? {}; } catch { /* first build */ }
const carried = [];

const num = x => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x))) ? null : Number(x);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const r2 = x => Math.round(x * 100) / 100;

// Index scales as of 2026: intelligence ~15..60, coding ~35..85.
function strengthsFrom(id, ai, code, ctx, image, baseline) {
  const a = ai ?? baseline?.ai ?? 35;
  const c = code ?? baseline?.code ?? (a * 1.35);
  const intel = clamp((a - 10) / 50);          // 0..1
  const coding = clamp((c - 30) / 55);
  return {
    code: r2(coding),
    reasoning: r2(intel),
    writing: r2(0.55 + intel * 0.45),
    chat: r2(0.75 + intel * 0.25),
    summarise: r2(0.7 + intel * 0.3),
    translate: r2(0.65 + intel * 0.35),
    data: r2(0.45 + (intel + coding) * 0.275),
    vision: image ? r2(0.55 + intel * 0.4) : 0,
    long_context: r2(ctx >= 1_000_000 ? 0.85 + intel * 0.15 : ctx >= 200_000 ? 0.6 + intel * 0.2 : 0.3),
  };
}

// --keep-strengths: refresh prices and facts only, keep every model's previous strengths (for when the
// benchmark source changes its scale and the new numbers are not yet comparable with the old ones).
const keepStrengths = args.includes('--keep-strengths');
const kept = [];

function strengthsOrPrevious(id, ai, code, ctx, image, baseline) {
  const prev = previous[id]?.strengths;
  if (keepStrengths && prev) { kept.push(id); return prev; }
  if (!baseline && prev && (ai === null || code === null)) {
    // Recover the missing index from the previous strengths (inverse of strengthsFrom's scaling).
    if (ai === null) ai = prev.reasoning * 50 + 10;
    if (code === null) code = prev.code * 55 + 30;
    carried.push(id);
  }
  return strengthsFrom(id, ai, code, ctx, image, baseline);
}

const models = {};
for (const [sid, svc] of Object.entries(services)) {
  for (const sm of svc.models) {
    if (models[sm.modelId]) continue;
    const m = byId.get(sm.modelId) ?? null;
    const f = factFor(sm.modelId);
    if (!m && !f) { console.warn(`[${sid}] ${sm.modelId} neither on OpenRouter nor in provider-facts; skipped`); continue; }
    if (!m) {
      // Facts only: strengths fall back to the family baseline below.
      byId.set(sm.modelId, { id: sm.modelId, name: f.m.name, pricing: {}, context_length: f.m.context, architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['tools'] });
    }
    const mm = byId.get(sm.modelId);
    const p = num(mm.pricing?.prompt), c = num(mm.pricing?.completion);
    const mods = mm.architecture?.input_modalities ?? [];
    const image = mods.includes('image');
    const b = mm.benchmarks?.artificial_analysis ?? {};
    // "-pro" variants usually lack indexes: lean on the base variant.
    const base = byId.get(sm.modelId.replace(/-pro$/, ''));
    const bb = base?.benchmarks?.artificial_analysis ?? {};
    const isPro = /-pro$/.test(sm.modelId) && base && base !== m;
    const baseline = isPro ? { ai: (num(bb.intelligence_index) ?? 35) + 2, code: (num(bb.coding_index) ?? null) } : undefined;
    const ctx = f?.m.context ?? mm.context_length;
    const entry = {
      provider: sm.modelId.split('/')[0],
      name: f?.m.name ?? (mm.name?.replace(/^(Anthropic|OpenAI|Google):\s*/, '') || sm.modelId),
      apiId: f?.m.apiId,
      strengths: strengthsOrPrevious(sm.modelId, num(b.intelligence_index), num(b.coding_index), ctx, image, baseline),
      price: f?.m.price ?? (p !== null && c !== null ? { input: r2(p * 1e6), output: r2(c * 1e6) } : undefined),
      context: ctx,
      maxOutput: f?.m.maxOutput,
      status: f ? statusOn(f.m) : undefined,
      retiresAt: f?.m.retiresAt,
      efforts: f?.m.efforts,
      defaultEffort: f?.m.defaultEffort,
      capabilities: [image ? 'vision' : null, (mm.supported_parameters ?? []).includes('tools') ? 'tools' : null].filter(Boolean),
      released: f?.m.released ?? (mm.created ? new Date(mm.created * 1000).toISOString().slice(0, 10) : undefined),
      sources: [],
    };
    // Sources: one entry per fact-backed field, else the OpenRouter seed.
    const srcs = f?.prov.sources ?? {};
    const fs = f?.m.sources ?? {};
    const backed = new Set(Object.keys(fs));
    for (const [field, key] of Object.entries(fs)) {
      const src = srcs[key];
      if (src) entry.sources.push({ url: src.url.replace('{id}', f.m.apiId ?? ''), date: src.fetched, field });
    }
    if (m) {
      if (!backed.has('price') && entry.price) entry.sources.push({ url: `https://openrouter.ai/${m.id}`, date: today, field: 'price' });
      if (!backed.has('context')) entry.sources.push({ url: `https://openrouter.ai/${m.id}`, date: today, field: 'context' });
    }
    // Kept strengths keep the date they were last derived, not today's.
    const keptSource = keepStrengths && previous[sm.modelId]?.sources?.find(x => x.field === 'strengths');
    entry.sources.push(keptSource || { url: 'https://artificialanalysis.ai/', date: today, field: 'strengths' });
    for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
    models[sm.modelId] = entry;
  }
}

// Models the facts file knows but no site lists (retired, deprecated, API-only) stay in the catalog with their
// status, so a site picker that still shows one resolves to a known, correctly-excluded model.
for (const prov of Object.values(facts.providers)) {
  for (const [id, fm] of Object.entries(prov.models ?? {})) {
    if (models[id]) continue;
    const seed = byId.get(id);
    const b = seed?.benchmarks?.artificial_analysis ?? {};
    const sources = Object.entries(fm.sources ?? {}).map(([field, key]) => prov.sources[key] && ({ url: prov.sources[key].url.replace('{id}', fm.apiId ?? ''), date: prov.sources[key].fetched, field })).filter(Boolean);
    models[id] = {
      provider: id.split('/')[0], name: fm.name, apiId: fm.apiId,
      strengths: strengthsOrPrevious(id, num(b.intelligence_index), num(b.coding_index), fm.context ?? seed?.context_length ?? 200000, true, undefined),
      price: fm.price, context: fm.context ?? seed?.context_length ?? 200000, maxOutput: fm.maxOutput, status: statusOn(fm), retiresAt: fm.retiresAt,
      efforts: fm.efforts, defaultEffort: fm.defaultEffort, capabilities: ['vision', 'tools'], released: fm.released, sources,
    };
    for (const k of Object.keys(models[id])) if (models[id][k] === undefined) delete models[id][k];
  }
}

const out = { schemaVersion: 1, generatedAt: today, factsGeneratedAt: facts.generatedAt, services: {}, models };
for (const [sid, svc] of Object.entries(services)) {
  out.services[sid] = { ...svc, models: svc.models.filter(sm => models[sm.modelId]) };
}
await writeFile(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(`catalog.json: ${Object.keys(out.services).length} services, ${Object.keys(models).length} models`);
if (kept.length) console.warn(`--keep-strengths: previous strengths kept for ${kept.length} models`);
if (carried.length) console.warn(`no benchmark indexes this time; previous index values kept for ${carried.length}: ${carried.join(', ')}`);
