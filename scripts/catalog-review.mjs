// The review sheet for catalog changes the daily refresh holds: one block per change, with what changed, the sources the
// catalog already cites, and every quote someone took from a saved copy of the source page. It makes no recommendation.
//   node scripts/catalog-review.mjs --published catalog.json --next catalog.json --log catalog-refresh.jsonl \
//     --openrouter models.json --docs docs-export.json --facts provider-facts.json --quotes review/quotes.json --out sheet.md
//     [--pages dir-of-saved-pages] [--behaviour behaviour.json] [--extra more.md]
// All inputs are read from copies you pass in; the tool never touches ~/.cache/euboulia or ~/.local/state/euboulia and
// writes only inside this checkout or the job's temp folder ($CLAUDE_JOB_DIR/tmp). The rules for what counts as news come
// from catalog-diff.mjs, the same module the refresh uses.
// quotes.json is a list of { item, url, fetchedAt, pageSha256, quote } where `item` is a block's heading. A quote counts
// only if its text is found, whitespace-normalised and with tags stripped (pageText below), in the saved page whose
// SHA-256 it records; a quote that is not found is an error (exit 1). An entry { item, url, fetchedAt, unchecked: "why" }
// records a page that could not be read. Nothing quoted for an item means the block says UNCHECKED and why.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCatalogs, factsDrift } from './catalog-diff.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

/** The text of a saved page as quotes are matched against it: scripts, styles and tags gone, entities decoded, one space per run of whitespace. JSON and Markdown are left as they are. */
export function pageText(raw) {
  let s = String(raw);
  if (!/^\s*[[{]/.test(s)) s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  return s.replace(/\s+/g, ' ').trim();
}

/** OpenRouter states prices in dollars per token, as strings; the catalog holds dollars per million tokens. */
export const perMillion = perToken => Number((Number(perToken) * 1e6).toPrecision(10)).toString();
const roundToCent = x => Math.round(x * 100) / 100;

const canon = v => JSON.stringify(v);
const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** Which item a log line belongs to: holds attach to the change they flag, so one price move is one block. */
export function parseLine(line, kind) {
  let m;
  const mk = (subject, field) => ({ key: `${kind === 'drift' ? 'docs: ' : ''}${subject}: ${field}`, subject, field });
  if (kind === 'drift') {
    if ((m = line.match(/^(\S+): in the \S+ docs, not in provider-facts$/))) return mk(m[1], 'not in provider-facts');
    if ((m = line.match(/^(\S+): in provider-facts, gone from the \S+ docs$/))) return mk(m[1], 'gone from the docs');
    if ((m = line.match(/^(\S+): (\S+) is /))) return mk(m[1], m[2]);
    return mk('docs', line);
  }
  if ((m = line.match(/^provider facts dated /))) return mk('catalog', 'factsGeneratedAt');
  if ((m = line.match(/^service (\S+): (\S+) changed$/))) return mk(`service ${m[1]}`, m[2]);
  if ((m = line.match(/^service (\S+): gone from the catalog$/))) return mk(`service ${m[1]}`, 'gone');
  if ((m = line.match(/^service (\S+): no longer offers (\S+)$/))) return mk(`service ${m[1]}`, `no longer offers ${m[2]}`);
  if ((m = line.match(/^(\S+): (new|gone from the catalog)$/))) return mk(m[1], m[2] === 'new' ? 'new' : 'gone');
  if ((m = line.match(/^(\S+): (input|output) price /))) return mk(m[1], 'price');
  if ((m = line.match(/^(\S+): strengths changed/))) return mk(m[1], 'strengths');
  if ((m = line.match(/^(\S+): (\S+) /))) return mk(m[1], m[2]);
  return mk('unparsed', line);
}

/** One item per (subject, field); items with a held line first, then routine changes, then docs-versus-facts. */
export function itemsFrom(record) {
  const items = new Map();
  const add = (line, kind) => {
    const p = parseLine(line, kind);
    if (!items.has(p.key)) items.set(p.key, { ...p, cls: kind === 'drift' ? 'docs-vs-facts' : 'routine', changes: [], holds: [], drift: [] });
    const it = items.get(p.key);
    (kind === 'hold' ? it.holds : kind === 'drift' ? it.drift : it.changes).push(line);
    if (kind === 'hold') it.cls = 'held';
  };
  for (const l of record.changes ?? []) add(l, 'change');
  for (const l of record.holds ?? []) add(l, 'hold');
  for (const l of record.drift ?? []) add(l, 'drift');
  const order = { held: 0, routine: 1, 'docs-vs-facts': 2 };
  return [...items.values()].sort((a, b) => order[a.cls] - order[b.cls]);
}

const FIELD_SOURCES = { retiresAt: ['status'], defaultEffort: ['efforts'], released: ['released'], name: ['name'] };
function citedSources(it, published, next) {
  const out = new Map();
  for (const cat of [published, next]) {
    const m = cat?.models?.[it.subject];
    for (const s of m?.sources ?? []) if ([it.field, ...(FIELD_SOURCES[it.field] ?? [])].includes(s.field)) out.set(`${s.url} ${s.date}`, `${s.url} (dated ${s.date}, for ${s.field})`);
  }
  return [...out.values()];
}

function describeChange(it, published, next) {
  const lines = [];
  const svc = it.subject.startsWith('service ') ? it.subject.slice(8) : null;
  if (svc && !it.field.startsWith('no longer') && it.field !== 'gone') {
    const a = published?.services?.[svc]?.[it.field], b = next?.services?.[svc]?.[it.field];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (canon(a[k]) !== canon(b[k])) lines.push(`${it.field}.${k}: ${clip(canon(a[k]) ?? 'none')} → ${clip(canon(b[k]) ?? 'none')}`);
    } else lines.push(`${it.field}: ${clip(canon(a) ?? 'none')} → ${clip(canon(b) ?? 'none')}`);
    return lines;
  }
  for (const l of it.changes) {
    const m = l.match(/^\S+: \S+ (.*) -> (.*)$/s);
    lines.push(m ? `${it.field}: before ${m[1]} → after ${m[2]}` : l);
  }
  for (const l of it.drift) lines.push(`the providers' docs, as crawled, and provider-facts.json disagree: ${l}`);
  return lines;
}

function fail(msg) { console.error(`catalog-review: ${msg}`); process.exit(1); }

function guardRead(p) {
  const abs = path.resolve(p);
  for (const dir of [path.join(os.homedir(), '.cache/euboulia'), path.join(os.homedir(), '.local/state/euboulia')]) {
    if (abs === dir || abs.startsWith(dir + path.sep)) fail(`refusing to read ${abs}: pass a copy instead (the live refresh folders are never touched by this tool)`);
  }
  return abs;
}
function guardOut(p) {
  const abs = path.resolve(p);
  const real = (() => { try { return path.join(realpathSync(path.dirname(abs)), path.basename(abs)); } catch { return abs; } })();
  const allowed = [root, process.env.CLAUDE_JOB_DIR && path.join(process.env.CLAUDE_JOB_DIR, 'tmp')].filter(Boolean).map(d => path.resolve(d));
  const inside = allowed.some(d => [abs, real].every(x => x === d || x.startsWith(d + path.sep)));
  if (!inside) fail(`refusing to write ${abs}: --out must be inside this checkout (${root}) or the job's temp folder ($CLAUDE_JOB_DIR/tmp)`);
  return abs;
}

/** Pure part: everything but argument parsing and file I/O. Returns { text, errors, counts }. */
export function buildSheet({ published, next, record, openrouter, openrouterSha, docs, facts, quotes, pages = new Map(), behaviour = {}, extra = '' }) {
  const errors = [];
  const items = itemsFrom(record);
  const known = new Set(items.map(i => i.key));
  const orById = new Map((openrouter?.data ?? []).map(m => [m.id, m]));
  const byItem = new Map();
  for (const q of quotes) {
    if (!q.item || !q.url || !q.fetchedAt || (q.quote == null && !q.unchecked)) { errors.push(`quote entry needs item, url, fetchedAt and a quote or an unchecked reason: ${clip(canon(q), 120)}`); continue; }
    if (!known.has(q.item)) { errors.push(`quote entry for "${q.item}" matches no item in the sheet (item must equal a ### heading)`); continue; }
    if (!byItem.has(q.item)) byItem.set(q.item, []);
    byItem.get(q.item).push(q);
  }
  const fetchedAtFor = sha => quotes.find(q => q.pageSha256 === sha)?.fetchedAt;

  let quoted = 0, unchecked = 0;
  const blocks = items.map(it => {
    const out = [`### ${it.key}`, '', `- Class: ${it.cls}`];
    for (const d of describeChange(it, published, next)) out.push(`- What changed: ${d}`);
    for (const h of it.holds) out.push(`- Held because: ${h}`);
    const cited = citedSources(it, published, next);
    out.push(cited.length ? `- Sources the catalog already cites for this field: ${cited.join('; ')}` : '- Sources the catalog already cites for this field: none for this field');

    const rec = orById.get(it.subject);
    if (rec && (it.field === 'price' || it.field === 'name')) {
      const p = rec.pricing ?? {};
      out.push(`- OpenRouter's record of this model (response SHA-256 ${openrouterSha ?? 'unknown'}, fetched ${fetchedAtFor(openrouterSha) ?? 'time not recorded'}): id ${rec.id}, name "${rec.name}"`
        + (it.field === 'price' ? `, pricing.prompt "${p.prompt}", pricing.completion "${p.completion}"` : ''));
      if (it.field === 'price') {
        const inM = perMillion(p.prompt), outM = perMillion(p.completion);
        out.push(`- Per million tokens (OpenRouter's per-token dollar string × 1,000,000; the catalog rounds to the cent): input ${inM} (${roundToCent(Number(inM))}), output ${outM} (${roundToCent(Number(outM))}); published catalog: input ${published?.models?.[it.subject]?.price?.input ?? 'none'}, output ${published?.models?.[it.subject]?.price?.output ?? 'none'}`);
        out.push(`- Rigor: method OpenRouter per-token price × 1e6; data response SHA-256 ${openrouterSha ?? 'unknown'}, fetched ${fetchedAtFor(openrouterSha) ?? 'time not recorded'}; n one model record; baseline the published catalog value; limits OpenRouter shows one endpoint's price, not necessarily the maker's own.`);
      }
    } else if (it.cls === 'docs-vs-facts') {
      const prov = it.subject.split('/')[0];
      const fm = facts?.providers?.[prov]?.models?.[it.subject], dm = docs?.providers?.[prov]?.models?.[it.subject];
      const fsrc = fm?.sources?.[it.field] && facts.providers[prov].sources?.[fm.sources[it.field]];
      out.push(`- provider-facts.json has: ${fm ? (it.field in fm ? `${it.field} ${clip(canon(fm[it.field]))}` : 'the model, without that field') : 'no entry for this model'}${fsrc ? `; its source ${fsrc.url} fetched ${fsrc.fetched}` : ''}`);
      out.push(`- The docs crawl (${docs?.generatedAt ?? 'undated'}) has: ${dm ? clip(canon(dm), 400) : 'no entry for this model'}`);
    }
    out.push(`- What the live 0.1.0 and the next build do with this field: ${behaviour[it.field] ?? 'not filled in'}`);

    const entries = byItem.get(it.key) ?? [];
    const good = [], bad = [];
    for (const q of entries) {
      if (q.unchecked && q.quote == null) { bad.push(`UNCHECKED: ${q.unchecked} (${q.url}, ${q.fetchedAt})`); continue; }
      const page = pages.get(q.pageSha256);
      if (page === undefined) { bad.push(`UNCHECKED: the saved page ${q.pageSha256} is not available to this run, so the quote from ${q.url} could not be checked`); continue; }
      const want = q.quote.replace(/\s+/g, ' ').trim();
      if (!want || !pageText(page).includes(want)) { errors.push(`"${it.key}": quote not found in the saved page ${q.pageSha256} (${q.url}): ${clip(want, 120)}`); continue; }
      good.push(q);
    }
    if (good.length) {
      quoted++;
      for (const q of good) out.push(`- Quoted from ${q.url} (fetched ${q.fetchedAt}, page SHA-256 ${q.pageSha256})${q.note ? ` (${q.note})` : ''}:`, '', `  > ${q.quote.replace(/\s+/g, ' ').trim()}`, '');
    } else {
      unchecked++;
      if (!bad.length) bad.push('UNCHECKED: no source page was quoted for this item');
    }
    for (const b of bad) out.push(`- ${b}`);
    out.push(`- Source quoted: ${good.length ? 'yes' : 'no'}`);
    return out.join('\n');
  });

  const heldItems = items.filter(i => i.cls === 'held').length;
  const own = compareCatalogs(published, next);
  const rebuilt = new Set([...own.changes, ...own.holds]), logged = new Set([...(record.changes ?? []), ...(record.holds ?? [])]);
  const notRebuilt = [...logged].filter(l => !rebuilt.has(l)), notLogged = [...rebuilt].filter(l => !logged.has(l));
  const driftNow = docs && facts ? factsDrift(facts, docs) : null;
  const list = ls => (ls.length ? ls.map(l => `  - ${l}`).join('\n') : '  - none');
  const head = [
    `# Held catalog changes: review sheet`,
    '',
    `Built by scripts/catalog-review.mjs from the refresh job's record of ${record.at} (outcome: ${record.outcome}). It makes no recommendation: each item says whether a source was quoted.`,
    '',
    '## What is waiting and why',
    '',
    `- The refresh of ${record.at} ended "${record.outcome}" with ${(record.changes ?? []).length} changes, ${(record.holds ?? []).length} held lines and ${(record.drift ?? []).length} docs-versus-facts lines.`,
    `- The job holds everything while any held line exists, so accepting publishes all ${(record.changes ?? []).length} changes together; the ${(record.holds ?? []).length} held lines flag ${heldItems} of them. There is no way to accept some.`,
    '- Held lines as logged:',
    list(record.holds ?? []),
    '',
    '## The log against a fresh rebuild',
    '',
    `Rebuild compared with the published catalog now (OpenRouter's feed may have moved since the job ran).`,
    '',
    '- Lines the log has and the rebuild lacks:',
    list(notRebuilt),
    '- Lines the rebuild has and the log lacks:',
    list(notLogged),
    ...(driftNow ? ['- Docs-versus-facts lines now that differ from the log: ' + ((driftNow.filter(l => !(record.drift ?? []).includes(l)).length + (record.drift ?? []).filter(l => !driftNow.includes(l)).length) || 'none')] : []),
    '',
    '## Items',
    '',
  ].join('\n');
  const n = items.length;
  const text = `${head}\n${blocks.join('\n\n')}\n\n${extra ? `${extra.trimEnd()}\n\n` : ''}<!-- items ${n} · quoted ${quoted} · unchecked ${unchecked} -->\n`;
  return { text, errors, counts: { items: n, quoted, unchecked } };
}

function main(argv) {
  const get = name => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : undefined; };
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('usage: node scripts/catalog-review.mjs --published f --next f --log f --openrouter f --docs f --facts f --quotes f --out f [--pages dir] [--behaviour f] [--extra f]');
    return;
  }
  for (const name of ['--published', '--next', '--log', '--openrouter', '--docs', '--facts', '--quotes', '--out']) if (!get(name)) fail(`missing ${name} (see --help)`);
  const out = guardOut(get('--out'));
  for (const name of ['--published', '--next', '--log', '--openrouter', '--docs', '--facts', '--quotes', '--pages', '--behaviour', '--extra']) if (get(name)) guardRead(get(name));
  const readText = name => { const p = guardRead(get(name)); if (!existsSync(p)) fail(`${name} ${p} does not exist`); return readFileSync(p, 'utf8'); };
  const readJson = name => { try { return JSON.parse(readText(name)); } catch (e) { fail(`${name} is not valid JSON: ${e.message}`); } };
  const published = readJson('--published'), next = readJson('--next'), docs = readJson('--docs'), facts = readJson('--facts'), quotes = readJson('--quotes');
  if (!Array.isArray(quotes)) fail('--quotes must hold a JSON list of entries');
  const orText = readText('--openrouter');
  const lines = readText('--log').split('\n').filter(l => l.trim());
  if (!lines.length) fail('--log has no records');
  let record;
  try { record = JSON.parse(lines.at(-1)); } catch { fail('the last record of --log is not valid JSON'); }
  const pages = new Map();
  if (get('--pages')) {
    const dir = guardRead(get('--pages'));
    for (const f of existsSync(dir) ? readdirSync(dir) : []) { try { const raw = readFileSync(path.join(dir, f)); pages.set(sha256(raw), raw.toString('utf8')); } catch { /* a subfolder */ } }
  }
  const behaviour = get('--behaviour') ? readJson('--behaviour') : {};
  const extra = get('--extra') ? readText('--extra') : '';
  const { text, errors } = buildSheet({ published, next, record, openrouter: JSON.parse(orText), openrouterSha: sha256(orText), docs, facts, quotes, pages, behaviour, extra });
  if (errors.length) { for (const e of errors) console.error(`catalog-review: ${e}`); console.error(`catalog-review: ${errors.length} problem(s); no sheet written`); process.exit(1); }
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
  console.log(text.trimEnd().split('\n').at(-1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
