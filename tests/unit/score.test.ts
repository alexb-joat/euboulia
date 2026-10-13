import { describe, expect, it } from 'vitest';
import { scoreCandidates } from '../../src/analyser/score';
import { estimateCost, formatUsd, outputTokensFor } from '../../src/analyser/cost';
import { cand, cls, model, prefs } from './helpers';

const strong = cand('strong', { strengths: { code: 0.95 }, price: { input: 10, output: 50 } });
const cheap = cand('cheap', { strengths: { code: 0.6 }, price: { input: 0.1, output: 0.5 } });
const mid = cand('mid', { strengths: { code: 0.8 }, price: { input: 2, output: 10 } });

describe('cost', () => {
  it('estimates api cost from both prices', () => {
    const c = estimateCost(model({ price: { input: 1, output: 5 } }), 1000, 'chat');
    expect(c.kind).toBe('api');
    if (c.kind === 'api') expect(c.usd).toBeCloseTo((1000 * 1 + 150 * 5) / 1e6, 8);
  });
  it('marks plan models as included and keeps the api equivalent', () => {
    const c = estimateCost(model(), 1000, 'chat', 'pro', 0.2);
    expect(c.kind).toBe('included');
    if (c.kind === 'included') { expect(c.plan).toBe('pro'); expect(c.apiUsd).toBeGreaterThan(0); }
  });
  it('is unknown without a price', () => {
    expect(estimateCost(model({ price: undefined }), 10, 'chat').kind).toBe('unknown');
  });
  it('scales output tokens per task', () => {
    expect(outputTokensFor('translate', 900)).toBe(900);
    expect(outputTokensFor('summarise', 10000)).toBe(800);
    expect(outputTokensFor('reasoning', 10)).toBe(1500);
  });
  it('formats dollars readably', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.0002)).toBe('<$0.001');
    expect(formatUsd(0.0034)).toBe('~$0.003');
    expect(formatUsd(0.25)).toBe('~$0.25');
  });
});

describe('scoreCandidates', () => {
  it('slider at 0 picks best fit, at 1 picks cheapest', () => {
    const q = scoreCandidates(cls('code'), [strong, cheap, mid], prefs({ costWeight: 0 }), [], 'svc');
    expect(q[0]!.modelId).toBe('strong');
    const c = scoreCandidates(cls('code'), [strong, cheap, mid], prefs({ costWeight: 1 }), [], 'svc');
    expect(c[0]!.modelId).toBe('cheap');
  });
  it('cost score is monotonic in price', () => {
    const r = scoreCandidates(cls('code'), [strong, cheap, mid], prefs(), [], 'svc');
    const by = Object.fromEntries(r.map(x => [x.modelId, x.costScore]));
    expect(by.cheap).toBeGreaterThan(by.mid!);
    expect(by.mid).toBeGreaterThan(by.strong!);
    expect(by.cheap).toBe(1);
    expect(by.strong).toBeCloseTo(0, 5);
  });
  it('filters by context and vision capability', () => {
    const small = cand('small', { context: 1000 });
    const blind = cand('blind', { capabilities: ['tools'] });
    const r = scoreCandidates(cls('code', 5000), [small, mid], prefs(), [], 'svc');
    expect(r.map(x => x.modelId)).toEqual(['mid']);
    const v = scoreCandidates(cls('vision', 100, { weights: { vision: 0.7, code: 0.3 } }), [blind, mid], prefs(), [], 'svc');
    expect(v.map(x => x.modelId)).toEqual(['mid']);
  });
  it('applies rule boosts and excludes', () => {
    const r = scoreCandidates(cls('code'), [strong, cheap, mid], prefs({ costWeight: 0 }), [
      { id: 'no-strong', when: { task: 'code' }, then: { exclude: ['strong'] } },
      { id: 'love-cheap', when: {}, then: { prefer: 'cheap', boost: 0.5 } },
    ], 'svc');
    expect(r.map(x => x.modelId)).toEqual(['cheap', 'mid']);
    expect(r[0]!.reasons[0]).toContain('love-cheap');
  });
  it('included models score well on cost regardless of api price', () => {
    const inc = cand('inc', { price: { input: 10, output: 50 } }, 'svc', { plan: 'pro', capWeight: 1 });
    const r = scoreCandidates(cls('code'), [inc, cheap], prefs(), [], 'svc');
    expect(r.find(x => x.modelId === 'inc')!.costScore).toBe(1);
  });
});
