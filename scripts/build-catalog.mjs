// Seed src/catalog/catalog.json: hosts/selectors/plans from services.json,
// model facts (price, context, capabilities, benchmark indexes) from the
// OpenRouter models API. Strengths are derived heuristically from the
// Artificial Analysis indexes and will be replaced by the crawler project.
//   node scripts/build-catalog.mjs [--from models.json]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const OPENROUTER = 'https://openrouter.ai/api/v1/models';
const today = new Date().toISOString().slice(0, 10);

const services = JSON.parse(await readFile(path.join(root, 'src/catalog/services.json'), 'utf8')).services;
let raw;
if (fromIdx !== -1) raw = JSON.parse(await readFile(args[fromIdx + 1], 'utf8')).data;
else raw = (await (await fetch(OPENROUTER)).json()).data;
if (!Array.isArray(raw)) throw new Error('unexpected OpenRouter payload');
const byId = new Map(raw.map(m => [m.id, m]));

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

const models = {};
for (const [sid, svc] of Object.entries(services)) {
  for (const sm of svc.models) {
    if (models[sm.modelId]) continue;
    const m = byId.get(sm.modelId);
    if (!m) { console.warn(`[${sid}] ${sm.modelId} not on OpenRouter; skipped`); continue; }
    const p = num(m.pricing?.prompt), c = num(m.pricing?.completion);
    const mods = m.architecture?.input_modalities ?? [];
    const image = mods.includes('image');
    const b = m.benchmarks?.artificial_analysis ?? {};
    // "-pro" variants usually lack indexes: lean on the base variant.
    const base = byId.get(sm.modelId.replace(/-pro$/, ''));
    const bb = base?.benchmarks?.artificial_analysis ?? {};
    const isPro = /-pro$/.test(sm.modelId) && base && base !== m;
    const baseline = isPro ? { ai: (num(bb.intelligence_index) ?? 35) + 2, code: (num(bb.coding_index) ?? null) } : undefined;
    models[sm.modelId] = {
      provider: sm.modelId.split('/')[0],
      name: m.name?.replace(/^(Anthropic|OpenAI|Google):\s*/, '') || sm.modelId,
      strengths: strengthsFrom(sm.modelId, num(b.intelligence_index), num(b.coding_index), m.context_length, image, baseline),
      price: p !== null && c !== null ? { input: r2(p * 1e6), output: r2(c * 1e6) } : undefined,
      context: m.context_length,
      capabilities: [image ? 'vision' : null, (m.supported_parameters ?? []).includes('tools') ? 'tools' : null].filter(Boolean),
      released: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : undefined,
      sources: [
        { url: `https://openrouter.ai/${m.id}`, date: today, field: 'price' },
        { url: `https://openrouter.ai/${m.id}`, date: today, field: 'context' },
        { url: 'https://artificialanalysis.ai/', date: today, field: 'strengths' },
      ],
    };
  }
}

const out = { schemaVersion: 1, generatedAt: today, services: {}, models };
for (const [sid, svc] of Object.entries(services)) {
  out.services[sid] = { ...svc, models: svc.models.filter(sm => models[sm.modelId]) };
}
await writeFile(path.join(root, 'src/catalog/catalog.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`catalog.json: ${Object.keys(out.services).length} services, ${Object.keys(models).length} models`);
