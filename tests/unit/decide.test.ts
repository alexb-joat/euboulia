import { describe, expect, it } from 'vitest';
import { decide } from '../../src/analyser/decide';
import { scoreCandidates } from '../../src/analyser/score';
import { explain } from '../../src/analyser/explain';
import { cand, cls, prefs } from './helpers';
import type { Catalog } from '../../src/shared/types';

const a = cand('a', { strengths: { code: 0.80 }, price: { input: 2, output: 10 } }, 'here');
const b = cand('b', { strengths: { code: 0.80 }, price: { input: 2, output: 10 } }, 'here');
const base = { classification: cls('code'), trustedServices: new Set<string>(), crossService: true };

function rank(c = [a, b], p = prefs()) { return scoreCandidates(cls('code'), c, p, [], 'here'); }

describe('decide', () => {
  it('returns undefined with no candidates', () => {
    expect(decide({ ...base, here: [], elsewhere: [] })).toBeUndefined();
  });
  it('prefers the current model within a tie', () => {
    const s = decide({ ...base, here: rank(), elsewhere: [], current: 'b' })!;
    expect(s.here.modelId).toBe('b');
    expect(s.isCurrent).toBe(true);
  });
  it('keeps the previous winner unless clearly beaten (hysteresis)', () => {
    const first = decide({ ...base, here: rank(), elsewhere: [], current: 'b' })!;
    const slightlyBetterA = cand('a', { strengths: { code: 0.81 }, price: { input: 2, output: 10 } }, 'here');
    const second = decide({ ...base, here: rank([slightlyBetterA, b]), elsewhere: [], previous: first })!;
    expect(second.here.modelId).toBe('b');
    const muchBetterA = cand('a', { strengths: { code: 0.99 }, price: { input: 2, output: 10 } }, 'here');
    const third = decide({ ...base, here: rank([muchBetterA, b]), elsewhere: [], previous: first })!;
    expect(third.here.modelId).toBe('a');
  });
  it('suggests elsewhere when the gain is large, cheaper, or fitter at no cost', () => {
    const far = cand('far', { strengths: { code: 0.99 }, price: { input: 0.1, output: 0.5 } }, 'there');
    const s = decide({ ...base, here: rank(), elsewhere: rank([far]) })!;
    expect(s.elsewhere?.modelId).toBe('far');
    const cheaperSame = cand('cheaper', { strengths: { code: 0.78 }, price: { input: 0.5, output: 2 } }, 'there');
    const s2 = decide({ ...base, here: rank(), elsewhere: rank([cheaperSame]) })!;
    expect(s2.elsewhere?.modelId).toBe('cheaper');
    const samePriceWorse = cand('worse', { strengths: { code: 0.7 }, price: { input: 2, output: 10 } }, 'there');
    expect(decide({ ...base, here: rank(), elsewhere: rank([samePriceWorse]) })!.elsewhere).toBeUndefined();
  });
  it('suppresses elsewhere for sensitive prompts unless trusted, and when disabled', () => {
    const far = cand('far', { strengths: { code: 0.99 }, price: { input: 0.1, output: 0.5 } }, 'there');
    const sensitive = cls('code', 200, { sensitive: ['email'] });
    expect(decide({ ...base, classification: sensitive, here: rank(), elsewhere: rank([far]) })!.elsewhere).toBeUndefined();
    expect(decide({ ...base, classification: sensitive, trustedServices: new Set(['there']), here: rank(), elsewhere: rank([far]) })!.elsewhere?.modelId).toBe('far');
    expect(decide({ ...base, crossService: false, here: rank(), elsewhere: rank([far]) })!.elsewhere).toBeUndefined();
  });
});

describe('explain', () => {
  const catalog: Catalog = {
    schemaVersion: 1, generatedAt: '2026-10-12',
    services: { here: { name: 'Here', hosts: ['here.test'], models: [], plans: { pro: { name: 'Pro', price: 20 } } }, there: { name: 'There', hosts: ['there.test'], models: [] } },
    models: {},
  };
  it('produces rows, a reason and the elsewhere line', () => {
    const far = cand('far', { strengths: { code: 0.99 }, price: { input: 0.1, output: 0.5 } }, 'there');
    const s = decide({ ...base, here: rank(), elsewhere: rank([far]) })!;
    const x = explain(s, catalog);
    expect(x.taskLabel).toBe('code');
    expect(x.rows.length).toBe(2);
    expect(x.rows.some(r => r.isWinner)).toBe(true);
    expect(x.why).toMatch(/code/);
    expect(x.elsewhere?.serviceName).toBe('There');
  });
  it('shows plan name and api equivalent for included models', () => {
    const inc = cand('inc', { price: { input: 2, output: 10 } }, 'here', { plan: 'pro', capWeight: 1 });
    const s = decide({ ...base, here: rank([inc]), elsewhere: [] })!;
    const row = explain(s, catalog).rows[0]!;
    expect(row.cost).toBe('included (Pro)');
    expect(row.apiCost).toMatch(/API equivalent/);
  });
});
