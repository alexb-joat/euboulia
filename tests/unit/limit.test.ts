// Plan options show how heavy they are on your limit, and Max gets a notice when a lighter option won.
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/analyser/classify';
import { formatWeight } from '../../src/analyser/cost';
import { decide } from '../../src/analyser/decide';
import { costLabel, effortNotice, explain, limitTitle, limitWeight } from '../../src/analyser/explain';
import { scoreCandidates } from '../../src/analyser/score';
import { BUNDLED, candidatesFor, capUnit } from '../../src/catalog/index';
import { DEFAULT_PREFS } from '../../src/shared/types';

const onMax = { ...DEFAULT_PREFS, services: { claude: { enabled: true, plan: 'max' } } };
const CODE = 'Refactor this TypeScript function and add unit tests for the edge cases:\nfunction f(x) { return x.map(y => y * 2); }';

function suggest(current?: string, text = CODE) {
  const cls = classify(text);
  const here = scoreCandidates(cls, candidatesFor(BUNDLED, 'claude', onMax), onMax, [], 'claude');
  return decide({ here, elsewhere: [], current, classification: cls, trustedServices: new Set(), crossService: false })!;
}

describe('limit weight', () => {
  it('formats weights and ratios as people read them', () => {
    expect([0.06, 0.1, 0.3, 1, 1.36, 2, 4.4, 6, 15].map(formatWeight))
      .toEqual(['<0.1×', '≈0.1×', '≈0.3×', '≈1×', '≈1.4×', '≈2×', '≈4.4×', '≈6×', '≈15×']);
  });
  it('measures against the weight-1 option, and shows none once that model is retired', () => {
    expect(capUnit(BUNDLED, 'claude')).toEqual({ short: 'Sonnet 5.5', full: 'Sonnet 5.5 · Medium' });
    expect(capUnit(BUNDLED, 'gemini', '2026-11-07')?.short).toBe('3.6 Flash');
    expect(capUnit(BUNDLED, 'gemini', '2026-11-19')).toBeUndefined();   // 3.6 Flash shuts down that day
  });
  it('plan options carry their weight in the cost label, priced options do not', () => {
    const s = suggest();
    const opus = (e: string) => s.ranked.find(r => r.key === `anthropic/claude-opus-5.5@${e}`)!;
    expect(limitWeight(BUNDLED, opus('xhigh'))).toBe('≈4.4× Sonnet 5.5');
    expect(costLabel(BUNDLED, opus('max'))).toBe('included (Max) · ≈6× Sonnet 5.5');
    expect(costLabel(BUNDLED, opus('max'), true)).toBe('included · ≈6× Sonnet 5.5');
    expect(limitTitle(BUNDLED, opus('max'))).toMatch(/^Opus 5\.5 · Max takes about 6× the share of your Max plan's limit that Sonnet 5\.5 · Medium takes per send\. Euboulia's estimate/);
    const priced = suggest(undefined).ranked.map(r => ({ ...r, plan: undefined, capWeight: undefined, cost: { kind: 'api' as const, usd: 0.01, tokensOut: 100 } }))[0]!;
    expect(limitWeight(BUNDLED, priced)).toBeUndefined();
    // The cloud's rows keep the parts apart (one line each); the joined label above is what the badge and "Elsewhere" show.
    const rows = explain(s, BUNDLED).rows;
    expect(rows.every(r => r.cost === 'included (Max)' && /^≈[\d.]+× Sonnet 5\.5$/.test(r.weight ?? ''))).toBe(true);
    const maxRow = [...rows, ...explain(s, BUNDLED).more].find(r => r.key === opus('max').key)!;
    expect(`${maxRow.cost} · ${maxRow.weight}`).toBe(costLabel(BUNDLED, opus('max')));
  });
});

describe('Max notice', () => {
  it('shows how much more of the limit Max takes than Extra high when a lighter option won', () => {
    const s = suggest('anthropic/claude-opus-5.5@max');
    expect(s.here.key).not.toBe('anthropic/claude-opus-5.5@max');
    const n = effortNotice(s, BUNDLED)!;
    expect(n.text).toBe('Max ≈1.4× Extra');
    expect(n.title).toMatch(/^Max takes about 1\.4× the share of your plan's limit that Extra takes per send/);
    expect(n.title).toContain('estimate');
  });
  it('compares with High on a model without Extra high', () => {
    expect(effortNotice(suggest('anthropic/claude-opus-4.6@max'), BUNDLED)?.text).toBe('Max ≈1.9× High');
  });
  it('stays quiet when Max is not selected, or when Max itself is the pick', () => {
    expect(effortNotice(suggest('anthropic/claude-opus-5.5@xhigh'), BUNDLED)).toBeUndefined();
    expect(effortNotice(suggest(undefined), BUNDLED)).toBeUndefined();
    const s = suggest('anthropic/claude-opus-5.5@max');
    const max = s.ranked.find(r => r.key === 'anthropic/claude-opus-5.5@max')!;
    expect(effortNotice({ ...s, here: max, isCurrent: true }, BUNDLED)).toBeUndefined();
  });
  it('says nothing without a plan, where the price already shows the difference', () => {
    const cls = classify(CODE);
    const p = { ...DEFAULT_PREFS, services: {} };
    const here = scoreCandidates(cls, candidatesFor(BUNDLED, 'claude', p), p, [], 'claude');
    const s = decide({ here, elsewhere: [], current: 'anthropic/claude-opus-5.5@max', classification: cls, trustedServices: new Set(), crossService: false })!;
    expect(effortNotice(s, BUNDLED)).toBeUndefined();
  });
});
