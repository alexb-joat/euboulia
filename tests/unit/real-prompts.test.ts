// End-to-end through the bundled catalog: the prompts that exposed bad suggestions on real pages.
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/analyser/classify';
import { scoreCandidates } from '../../src/analyser/score';
import { BUNDLED, candidatesFor } from '../../src/catalog/index';
import { DEFAULT_PREFS } from '../../src/shared/types';

const CRAWLER = "Grand Crawler: let's build the crawling scraping system that gathers the best available and relevant data from the net, analysis it, and then suggests the best steps for the best work experience possible. We need to catch timings and increase the business value while decreasing the costs. Be smart, adaptive, novel. Also, add captcha solver";

function pick(text: string, service: string, costWeight = DEFAULT_PREFS.costWeight): string {
  const cls = classify(text);
  const ranked = scoreCandidates(cls, candidatesFor(BUNDLED, service, { ...DEFAULT_PREFS, services: {} }), { ...DEFAULT_PREFS, costWeight }, [], service);
  return ranked[0]!.label;
}

describe('suggestions on real prompts', () => {
  it('a system-building prompt is code work, not a quick chat', () => {
    const c = classify(CRAWLER);
    expect(c.primary).toBe('code');
    expect(c.weights.chat ?? 0).toBe(0);
  });
  it('does not suggest the smallest Claude model for it at the default slider', () => {
    expect(pick(CRAWLER, 'claude')).not.toBe('Haiku 5.5');
  });
  it('quality-first (slider 0) picks the strongest model, cheapest-first (slider 1) the cheapest', () => {
    expect(pick(CRAWLER, 'claude', 0)).toMatch(/Fable|Opus/);
    expect(pick(CRAWLER, 'claude', 1)).toMatch(/^Haiku 5\.5/);
  });
  it('"lean cheap" still will not drop to a model far weaker than the best', () => {
    expect(pick(CRAWLER, 'claude', 0.7)).not.toMatch(/^Haiku 5\.5/);
  });
  it('a trivial question still gets the cheap model', () => {
    expect(pick('print hello world in one line', 'gemini')).not.toMatch(/Pro|Argon/);   // the two Flash models share a price; the fitter one wins
    expect(pick("What's the capital of Portugal?", 'claude')).toMatch(/^Haiku 5\.5/);
  });
  it('a long plain-language prompt is weighed for quality, not labelled quick chat', () => {
    const c = classify('Tell me about the history of the Roman republic and how its institutions changed over the centuries, and what lessons that holds for modern governments today. '.repeat(2));
    expect(c.primary).toBe('reasoning');
    expect(c.signals).toContain('long prompt');
  });
});
