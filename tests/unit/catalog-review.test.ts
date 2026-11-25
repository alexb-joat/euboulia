// The review sheet is what Alex reads before accepting held catalog changes, so its promises are tested with small
// fixtures: the held lines are the log's, a missing quote says UNCHECKED, a wrong quote is an error, prices are converted
// from OpenRouter's per-token strings, and it never writes outside the checkout or the job folder.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSheet, pageText, parseLine, perMillion } from '../../scripts/catalog-review.mjs';

const root = path.resolve(__dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const model = (over = {}) => ({ name: 'M', price: { input: 0.5, output: 1 }, strengths: { code: 0.5 }, sources: [{ url: 'https://openrouter.ai/a/m', date: '2026-11-07', field: 'price' }], ...over });
const published = { schemaVersion: 1, factsGeneratedAt: '2026-10-30', services: {}, models: { 'a/m': model(), 'a/n': model({ name: 'Old name' }) } };
const next = { ...published, models: { 'a/m': model({ price: { input: 1.28, output: 2.56 } }), 'a/n': model({ name: 'New name' }) } };
const record = {
  at: '2026-11-25T10:46:56.796Z', outcome: 'held',
  changes: ['a/m: price {"input":0.5,"output":1} -> {"input":1.28,"output":2.56}', 'a/n: name "Old name" -> "New name"'],
  holds: ['a/m: input price 0.5 -> 1.28, a move of more than half', 'a/m: output price 1 -> 2.56, a move of more than half'],
  drift: ['a/x: in the anthropic docs, not in provider-facts'],
};
const openrouter = JSON.stringify({ data: [{ id: 'a/m', name: 'Maker: M', pricing: { prompt: '0.00000128', completion: '0.00000256' } }, { id: 'a/n', name: 'New name', pricing: {} }] });
const docs = { generatedAt: '2026-11-25', providers: { a: { models: { 'a/x': { name: 'X', status: 'active' } } } } };
const facts = { providers: { a: { sources: {}, models: {} } } };
const page = '<html><body><script>var x = 1;</script><p>Price is  <b>$1.28</b>\n per million tokens.</p></body></html>';

let dir: string;
beforeAll(() => { mkdirSync(path.join(root, 'test-results'), { recursive: true }); dir = mkdtempSync(path.join(root, 'test-results/catalog-review-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(quotes: unknown[], extra: string[] = [], out = path.join(dir, 'sheet.md')) {
  const pages = path.join(dir, 'pages');
  mkdirSync(pages, { recursive: true });
  writeFileSync(path.join(pages, 'page.html'), page);
  const f = (name: string, data: unknown) => { const p = path.join(dir, name); writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data)); return p; };
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/catalog-review.mjs'),
    '--published', f('pub.json', published), '--next', f('next.json', next), '--log', f('log.jsonl', `${JSON.stringify({ ...record, at: '2026-11-24' })}\n${JSON.stringify(record)}\n`),
    '--openrouter', f('or.json', openrouter), '--docs', f('docs.json', docs), '--facts', f('facts.json', facts), '--quotes', f('quotes.json', quotes),
    '--pages', pages, '--out', out, ...extra], { encoding: 'utf8', env: { ...process.env, CLAUDE_JOB_DIR: '' } });
  return { ...r, out };
}
const good = { item: 'a/m: price', url: 'https://example.test/pricing', fetchedAt: '2026-11-25T12:00:00Z', pageSha256: sha(page), quote: 'Price is $1.28 per million tokens.' };

describe('catalog-review', () => {
  it('lists exactly the log record’s held lines, merged into the price blocks they flag', () => {
    const r = run([good]);
    expect(r.status, r.stderr).toBe(0);
    const sheet = readFileSync(r.out, 'utf8');
    for (const h of record.holds) expect(sheet).toContain(`  - ${h}`);
    expect(sheet.match(/^### /gm)).toHaveLength(3);
    expect(sheet).toContain('### a/m: price\n\n- Class: held');
    expect(sheet).toContain('### a/n: name\n\n- Class: routine');
    expect(sheet).toContain('### docs: a/x: not in provider-facts\n\n- Class: docs-vs-facts');
    expect(sheet).toContain('accepting publishes all 2 changes together; the 2 held lines flag 1 of them');
  });

  it('prints UNCHECKED, with the reason, for an item nobody quoted, and counts it', () => {
    const r = run([good]);
    const sheet = readFileSync(r.out, 'utf8');
    expect(sheet).toContain('UNCHECKED: no source page was quoted for this item');
    expect(sheet.trimEnd().split('\n').at(-1)).toBe('<!-- items 3 · quoted 1 · unchecked 2 -->');
    expect(r.stdout.trimEnd().split('\n').at(-1)).toBe('<!-- items 3 · quoted 1 · unchecked 2 -->');
  });

  it('says when an item first appeared in the log', () => {
    const sheet = readFileSync(run([good]).out, 'utf8');
    expect(sheet).toContain('- In the job\'s log: first in the record of 2026-11-24, and in 2 of 2 records read (the most recent is 2026-11-25T10:46:56.796Z).');
  });

  it('shows a quote only after finding it in the saved page, whitespace-normalised and with tags stripped', () => {
    const sheet = readFileSync(run([good]).out, 'utf8');
    expect(sheet).toContain('> Price is $1.28 per million tokens.');
    expect(sheet).toContain('- Source quoted: yes, from example.test');
    expect(sheet).toContain('1 of 3 items have at least one quote found in a saved page; 0 of those are quoted from OpenRouter only');
    expect(sheet).toContain(`page SHA-256 ${sha(page)}`);
  });

  it('exits 1, and writes no sheet, when a quote is not in the page it names', () => {
    const out = path.join(dir, 'wrong.md');
    const r = run([{ ...good, quote: 'Price is $0.12 per million tokens.' }], [], out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('quote not found in the saved page');
    expect(() => readFileSync(out)).toThrow();
  });

  it('counts a quote whose saved page is missing as UNCHECKED, not as quoted', () => {
    const r = run([{ ...good, pageSha256: sha('some other page') }]);
    expect(r.status).toBe(0);
    expect(readFileSync(r.out, 'utf8')).toContain('is not available to this run');
    expect(r.stdout).toContain('quoted 0 · unchecked 3');
  });

  it('records an explicit UNCHECKED reason and rejects an entry for an item that does not exist', () => {
    const blocked = { item: 'a/n: name', url: 'https://example.test/n', fetchedAt: '2026-11-25T12:00:00Z', unchecked: 'blocked' };
    expect(readFileSync(run([blocked]).out, 'utf8')).toContain('UNCHECKED: blocked (https://example.test/n, 2026-11-25T12:00:00Z)');
    const typo = run([{ ...blocked, item: 'a/n: nme' }]);
    expect(typo.status).toBe(1);
    expect(typo.stderr).toContain('matches no item');
  });

  it('converts OpenRouter’s per-token strings to dollars per million tokens and states the conversion', () => {
    expect(perMillion('0.00000128')).toBe('1.28');
    expect(perMillion('0.0000000015')).toBe('0.0015');
    expect(perMillion('0.000003')).toBe('3');
    const sheet = readFileSync(run([good]).out, 'utf8');
    expect(sheet).toContain('pricing.prompt "0.00000128", pricing.completion "0.00000256"');
    expect(sheet).toContain("OpenRouter's per-token dollar string × 1,000,000");
    expect(sheet).toContain('input 1.28 (1.28), output 2.56 (2.56); published catalog: input 0.5, output 1');
    expect(sheet).toContain('Rigor: method OpenRouter per-token price × 1e6');
    expect(sheet).toContain("OpenRouter's current record gives the same price as the job's record.");
  });

  it('says where the feed has moved since the job’s record', () => {
    const moved = JSON.stringify({ data: [{ id: 'a/m', name: 'Maker: M', pricing: { prompt: '0.00000082', completion: '0.00000155' } }] });
    const { text } = buildSheet({ published, next, record, openrouter: JSON.parse(moved), openrouterSha: sha(moved), docs, facts, quotes: [] });
    expect(text).toContain("OpenRouter's feed has moved since the job's record: the record says input 1.28, output 2.56; the feed now gives input 0.82, output 1.55.");
  });

  it('describes a changed service field key by key, effort lists by effort id', () => {
    const svc = (label: string, pick: string) => ({ claude: { host: 'x', models: [], efforts: [{ id: 'xhigh', label, outputMultiplier: 2.2 }, { id: 'max', label: 'Max' }], selectors: { pickerOpen: [pick], composer: ['c'] } } });
    const rec = { at: 'now', outcome: 'held', changes: ['service claude: efforts changed', 'service claude: selectors changed'], holds: [], drift: [] };
    const { text } = buildSheet({ published: { ...published, services: svc('Extra high', 'a') }, next: { ...next, services: svc('Extra', 'b') }, record: rec, openrouter: { data: [] }, openrouterSha: 'x', docs, facts, quotes: [] });
    expect(text).toContain('- What changed: efforts[xhigh].label: "Extra high" → "Extra"');
    expect(text).not.toContain('efforts[max]');
    expect(text).toContain('- What changed: selectors.pickerOpen: ["a"] → ["b"]');
    expect(text).not.toContain('selectors.composer');
  });

  it('refuses an --out outside the checkout and the job folder, and a log from the live refresh folders', () => {
    const outside = run([good], [], path.join(os.tmpdir(), 'catalog-review-should-not-exist.md'));
    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain('refusing to write');
    const live = spawnSync(process.execPath, [path.join(root, 'scripts/catalog-review.mjs'), '--published', 'a', '--next', 'a', '--log', path.join(os.homedir(), '.local/state/euboulia/catalog-refresh.jsonl'),
      '--openrouter', 'a', '--docs', 'a', '--facts', 'a', '--quotes', 'a', '--out', path.join(dir, 'x.md')], { encoding: 'utf8' });
    expect(live.status).toBe(1);
    expect(live.stderr).toContain('refusing to read');
  });
});

describe('catalog-review helpers', () => {
  it('pageText drops scripts and tags, decodes entities and collapses whitespace, but leaves JSON alone', () => {
    expect(pageText(page)).toBe('Price is $1.28 per million tokens.');
    expect(pageText('<p>R&amp;D &lt;3 &#36;5</p>')).toBe('R&D <3 $5');
    expect(pageText('{"a": "<b>x</b>",\n "b": 1}')).toBe('{"a": "<b>x</b>", "b": 1}');
  });
  it('parseLine puts a hold with the change it flags, and keeps docs lines apart', () => {
    expect(parseLine('a/m: input price 0.5 -> 1.28, a move of more than half', 'hold').key).toBe('a/m: price');
    expect(parseLine('a/m: price {"input":1} -> {"input":2}', 'change').key).toBe('a/m: price');
    expect(parseLine('service claude: selectors changed', 'change').key).toBe('service claude: selectors');
    expect(parseLine('a/m: status is "active" in provider-facts, "legacy" in the docs', 'drift').key).toBe('docs: a/m: status');
  });
});
