import { describe, expect, it } from 'vitest';
import { classify } from '../../src/analyser/classify';
import { decide } from '../../src/analyser/decide';
import { explain } from '../../src/analyser/explain';
import { scoreCandidates } from '../../src/analyser/score';
import { resolveOptionKey, sameOption } from '../../src/catalog/aliases';
import { BUNDLED, candidatesFor } from '../../src/catalog/index';
import { DEFAULT_PREFS } from '../../src/shared/types';

const prefs = { ...DEFAULT_PREFS, services: {} };
const CODE = "let's build the crawling scraping system with a database and an api, analyse the data and design the architecture";

describe('effort levels', () => {
  it('expands models with efforts into one option per level, and lists the older models', () => {
    const c = candidatesFor(BUNDLED, 'claude', prefs);
    const opus = c.filter(x => x.modelId === 'anthropic/claude-opus-5.5').map(x => x.label);
    expect(opus).toEqual(['Opus 5.5 · Light', 'Opus 5.5 · Medium', 'Opus 5.5 · High', 'Opus 5.5 · Extra high', 'Opus 5.5 · Max']);
    expect(c.find(x => x.modelId === 'anthropic/claude-haiku-4.5')!.key).toBe('anthropic/claude-haiku-4.5');   // no effort control documented
    expect(c.filter(x => x.modelId === 'anthropic/claude-opus-4.6').map(x => x.effort!.id)).toEqual(['low', 'medium', 'high', 'max']);   // no xhigh on 4.6
    for (const old of ['Fable 5 · High', 'Opus 4.8 · Max', 'Sonnet 4.6 · Max', 'Haiku 4.5']) expect(c.some(x => x.label === old), old).toBe(true);
  });
  it('higher effort costs more output tokens and fits hard tasks better', () => {
    const ranked = scoreCandidates(classify(CODE), candidatesFor(BUNDLED, 'claude', prefs), { ...prefs, costWeight: 0 }, [], 'claude');
    const get = (e: string) => ranked.find(r => r.key === `anthropic/claude-sonnet-5.5@${e}`)!;
    expect(get('max').fit).toBeGreaterThan(get('high').fit);
    expect(get('xhigh').fit).toBeGreaterThan(get('high').fit);
    expect(get('high').fit).toBeGreaterThan(get('low').fit);
    expect(get('max').cost.tokensOut).toBeGreaterThan(get('medium').cost.tokensOut);
    expect(get('low').cost.tokensOut).toBeLessThan(get('medium').cost.tokensOut);
  });
  it('effort does not change fit for a quick chat', () => {
    const ranked = scoreCandidates(classify("What's the capital of Portugal?"), candidatesFor(BUNDLED, 'claude', prefs), prefs, [], 'claude');
    const fits = ranked.filter(r => r.modelId === 'anthropic/claude-sonnet-5.5').map(r => r.fit);
    expect(new Set(fits.map(f => f.toFixed(4))).size).toBe(1);
  });
  it('reads the effort from the picker label', () => {
    expect(resolveOptionKey(BUNDLED, 'claude', 'Opus 5.5 Max')).toBe('anthropic/claude-opus-5.5@max');
    expect(resolveOptionKey(BUNDLED, 'claude', 'Opus 5.5')).toBe('anthropic/claude-opus-5.5');
    expect(resolveOptionKey(BUNDLED, 'claude', 'Haiku 5.5 Low')).toBe('anthropic/claude-haiku-5.5@low');
    expect(resolveOptionKey(BUNDLED, 'claude', 'Sonnet 5.5 Extra high')).toBe('anthropic/claude-sonnet-5.5@xhigh');
    expect(resolveOptionKey(BUNDLED, 'claude', 'Opus 4.8')).toBe('anthropic/claude-opus-4.8');
    expect(resolveOptionKey(BUNDLED, 'claude', 'Opus 5')).toBe('anthropic/claude-opus-5');
  });
  it('"Good pick" needs the exact effort; an unknown effort on the same model gets a suggestion', () => {
    const cls = classify(CODE);
    const here = scoreCandidates(cls, candidatesFor(BUNDLED, 'claude', prefs), prefs, [], 'claude');
    const top = here[0]!;
    const exact = decide({ here, elsewhere: [], current: top.key, classification: cls, trustedServices: new Set(), crossService: false })!;
    expect(exact.isCurrent).toBe(true);
    const bare = decide({ here, elsewhere: [], current: top.modelId, classification: cls, trustedServices: new Set(), crossService: false })!;
    expect(bare.here.modelId).toBe(top.modelId);
    expect(bare.isCurrent).toBe(top.key === top.modelId);
  });
  it('a bare model id matches any of its effort options', () => {
    expect(sameOption('anthropic/claude-opus-5.5', 'anthropic/claude-opus-5.5@high')).toBe(true);
    expect(sameOption('anthropic/claude-opus-5.5@max', 'anthropic/claude-opus-5.5@high')).toBe(false);
    expect(sameOption('anthropic/claude-opus-5', 'anthropic/claude-opus-5.5@high')).toBe(false);
  });
  it('the cloud marks the selected option and lists every other one', () => {
    const cls = classify(CODE);
    const here = scoreCandidates(cls, candidatesFor(BUNDLED, 'claude', prefs), prefs, [], 'claude');
    const s = decide({ here, elsewhere: [], current: 'anthropic/claude-opus-5.5@max', classification: cls, trustedServices: new Set(), crossService: false })!;
    const x = explain(s, BUNDLED);
    expect(x.rows.length + x.more.length).toBe(here.length);
    expect([...x.rows, ...x.more].filter(r => r.isCurrent).map(r => r.label)).toEqual(['Opus 5.5 · Max']);
  });
  it('ChatGPT: Work and Chat pickers, effort read from the model button', () => {
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-6.1 Sol Light')).toBe('openai/gpt-6.1-sol@low');
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-6 Astra Max')).toBe('openai/gpt-6-astra@max');
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-6 Astra Extra High')).toBe('openai/gpt-6-astra@xhigh');
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-6 High')).toBe('openai/gpt-6-sol@high');          // Chat's "GPT-6" is GPT-6 Sol
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-6 Instant')).toBe('openai/gpt-6-sol@none');
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-6 Pro')).toBe('openai/gpt-6-astra');              // Chat's Pro effort is Astra
    expect(resolveOptionKey(BUNDLED, 'chatgpt', 'GPT-5.6 Terra')).toBe('openai/gpt-5.6-terra');
    const labels = new Set(candidatesFor(BUNDLED, 'chatgpt', prefs).map(c => c.label.split(' · ')[0]));
    expect([...labels]).toEqual(['GPT-6', 'GPT-6 Astra', 'GPT-6.1 Sol', 'GPT-6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna']);
    expect(candidatesFor(BUNDLED, 'chatgpt', prefs).some(c => c.modelId === 'openai/gpt-5.5')).toBe(false);   // retired from ChatGPT 2026-10-14
  });
});
