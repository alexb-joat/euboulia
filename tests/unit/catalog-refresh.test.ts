// The refresh publishes to a public repository without anyone watching, so its decisions are tested end to end against
// a throwaway bare repository, with a saved OpenRouter response instead of the network.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareCatalogs, factsDrift } from '../../scripts/catalog-diff.mjs';

const root = path.resolve(__dirname, '../..');
const model = (over = {}) => ({ name: 'M', price: { input: 2, output: 6 }, strengths: { code: 0.5 }, ...over });

describe('compareCatalogs', () => {
  const base = { generatedAt: '2026-10-30', factsGeneratedAt: '2026-10-30', models: { 'a/m': model() }, services: { s: { host: 'x', models: [{ modelId: 'a/m' }] } } };
  const withModel = (m: object) => ({ ...base, models: { 'a/m': model(m) } });

  it('ignores a new build date', () => {
    expect(compareCatalogs(base, { ...base, generatedAt: '2026-11-03' })).toEqual({ changes: [], holds: [] });
  });
  it('lets ordinary news through: a retirement, a small price move, a new model', () => {
    expect(compareCatalogs(base, withModel({ status: 'retired' })).holds).toEqual([]);
    const moved = compareCatalogs(base, withModel({ price: { input: 2.2, output: 6 } }));
    expect(moved.holds).toEqual([]); expect(moved.changes[0]).toContain('price');
    const added = compareCatalogs(base, { ...base, models: { ...base.models, 'a/n': model() } });
    expect(added.holds).toEqual([]); expect(added.changes).toEqual(['a/n: new']);
  });
  it('holds a model or service that vanished', () => {
    expect(compareCatalogs(base, { ...base, models: {} }).holds).toContain('a/m: gone from the catalog');
    expect(compareCatalogs(base, { ...base, services: {} }).holds).toContain('service s: gone from the catalog');
    expect(compareCatalogs(base, { ...base, services: { s: { host: 'x', models: [] } } }).holds).toContain('service s: no longer offers a/m');
  });
  it('holds a price that jumps, drops to zero or disappears, and any change of strengths', () => {
    expect(compareCatalogs(base, withModel({ price: { input: 4, output: 6 } })).holds).toHaveLength(1);
    expect(compareCatalogs(base, withModel({ price: { input: 0, output: 6 } })).holds).toHaveLength(1);
    expect(compareCatalogs(base, withModel({ price: undefined })).holds).toHaveLength(2);
    expect(compareCatalogs(base, withModel({ strengths: { code: 0.6 } })).holds).toHaveLength(1);
  });
  it('does not count re-dated sources as news, or every day would publish', () => {
    const dated = (date: string) => ({ sources: [{ url: 'https://openrouter.ai/a/m', date, field: 'price' }] });
    expect(compareCatalogs({ ...base, models: { 'a/m': model(dated('2026-10-30')) } }, { ...base, models: { 'a/m': model(dated('2026-11-02')) } }))
      .toEqual({ changes: [], holds: [] });
  });
  it('lets a cent or two through on a very cheap model, however large the percentage', () => {
    const cheap = { ...base, models: { 'a/m': model({ price: { input: 0.02, output: 0.13 } }) } };
    const moved = compareCatalogs(cheap, { ...base, models: { 'a/m': model({ price: { input: 0.05, output: 0.09 } }) } });
    expect(moved.holds).toEqual([]); expect(moved.changes).toHaveLength(1);
  });
  it('treats key order as no change', () => {
    expect(compareCatalogs(base, withModel({ price: { output: 6, input: 2 } })).changes).toEqual([]);
  });
});

describe('factsDrift', () => {
  const facts = { providers: {
    anthropic: { models: { 'a/m': { price: { input: 2, output: 6 }, released: '2026-01-01', note: 'by hand' } } },
    google: { models: { 'g/m': { price: { input: 1, output: 1 } } } },
  } };
  const docs = (m: object) => ({ providers: { anthropic: { models: { 'a/m': m } } } });

  it('stays quiet on agreement, and on what the crawl does not state or cover', () => {
    expect(factsDrift(facts, docs({ price: { output: 6, input: 2 }, released: null }))).toEqual([]);
  });
  it('reports a changed figure, a new model and a model gone from the docs', () => {
    expect(factsDrift(facts, docs({ price: { input: 3, output: 6 } }))[0]).toContain('a/m: price');
    const lines = factsDrift(facts, { providers: { anthropic: { models: { 'a/new': {} } } } });
    expect(lines).toEqual(['a/new: in the anthropic docs, not in provider-facts', 'a/m: in provider-facts, gone from the anthropic docs']);
  });
});

describe('refresh-catalog', () => {
  // A full feed, as OpenRouter would send it; provider-facts.json overrides it where it has figures, so `vanishing` is
  // a model only the feed knows.
  const json = (file: string) => JSON.parse(readFileSync(path.join(root, 'src/catalog', file), 'utf8'));
  const ids: string[] = [...new Set<string>(Object.values<{ models: { modelId: string }[] }>(json('services.json').services).flatMap(svc => svc.models.map(m => m.modelId)))];
  const inFacts = new Set(Object.values<{ models: object }>(json('provider-facts.json').providers).flatMap(prov => Object.keys(prov.models)));
  const vanishing = ids.find(id => !inFacts.has(id))!;
  const without = ids.filter(id => id !== vanishing);
  const seed = (id: string, prompt = '0.000002') => ({ id, name: id, pricing: { prompt, completion: '0.000006' }, context_length: 128000 });
  let tmp: string, bare: string, dir: string, state: string, fixture: string;

  const refresh = (feed: object[], ...flags: string[]) => {
    writeFileSync(fixture, JSON.stringify({ data: feed }));
    const r = spawnSync(process.execPath, ['scripts/refresh-catalog.mjs', '--no-notify', '--from', fixture, ...flags], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, CATALOG_REPO: bare, CATALOG_DIR: dir, EUBOULIA_STATE: state,
        GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' },
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  const commits = () => Number(execFileSync('git', ['-C', bare, 'rev-list', '--count', 'HEAD']).toString().trim());
  const log = () => readFileSync(path.join(state, 'catalog-refresh.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'euboulia-refresh-'));
    bare = path.join(tmp, 'catalog.git'); dir = path.join(tmp, 'clone'); state = path.join(tmp, 'state'); fixture = path.join(tmp, 'models.json');
    execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', bare]);
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('publishes the first build, then nothing on a day without news', () => {
    const all = ids.map(id => seed(id));
    expect(refresh(all)).toContain('published');
    expect(commits()).toBe(1);
    expect(refresh(all)).toContain('unchanged');
    expect(commits()).toBe(1);
  });
  it('dry run reports and writes nothing', () => {
    const lines = log().length;
    expect(refresh(ids.map(id => seed(id, '0.0000021')), '--dry-run')).toContain('dry run, would be: published');
    expect(commits()).toBe(1);
    expect(log()).toHaveLength(lines);
  });
  it('publishes a small price move on its own', () => {
    expect(refresh(ids.map(id => seed(id, '0.0000021')))).toContain('published');
    expect(commits()).toBe(2);
  });
  it('holds when a model vanishes, and leaves the published catalog alone', () => {
    const before = readFileSync(path.join(dir, 'catalog.json'), 'utf8');
    const out = refresh(without.map(id => seed(id, '0.0000021')));
    expect(out).toContain('held for review');
    expect(out).toContain(`${vanishing}: gone from the catalog`);
    expect(commits()).toBe(2);
    expect(readFileSync(path.join(dir, 'catalog.json'), 'utf8')).toBe(before);
    expect(log().at(-1).outcome).toBe('held');
  });
  it('publishes a held change once accepted', () => {
    expect(refresh(without.map(id => seed(id, '0.0000021')), '--accept')).toContain('published');
    expect(commits()).toBe(3);
  });
  it('reports docs drift without letting it into the catalog', () => {
    const docs = path.join(tmp, 'docs.json');
    writeFileSync(docs, JSON.stringify({ providers: { anthropic: { models: { 'anthropic/brand-new': {} } } } }));
    const out = refresh(without.map(id => seed(id, '0.0000021')), '--compare-facts', docs);
    expect(out).toContain('anthropic/brand-new: in the anthropic docs, not in provider-facts');
    expect(out).toContain('unchanged');
    expect(commits()).toBe(3);
    expect(existsSync(path.join(state, 'catalog-refresh-seen.json'))).toBe(true);
  });
});
