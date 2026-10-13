import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../../src/catalog/schema';
import { BUNDLED, candidatesElsewhere, candidatesFor, serviceForHost } from '../../src/catalog/index';
import { resolveModelLabel } from '../../src/catalog/aliases';
import { validateRule } from '../../src/analyser/rules';
import { prefs } from './helpers';

describe('catalog', () => {
  it('bundled catalog validates and covers the supported services', () => {
    expect(Object.keys(BUNDLED.services)).toEqual(['claude', 'chatgpt', 'gemini', 'grok', 'perplexity', 'mistral', 'deepseek', 'copilot', 'poe', 'openrouter']);
    expect(serviceForHost(BUNDLED, 'claude.ai')).toBe('claude');
    expect(serviceForHost(BUNDLED, 'chat.openai.com')).toBe('chatgpt');
    expect(serviceForHost(BUNDLED, 'www.perplexity.ai')).toBe('perplexity');
    expect(serviceForHost(BUNDLED, 'example.com')).toBeNull();
  });
  it('a model seen in the picker counts as included in the plan', () => {
    const p = prefs({ services: { claude: { enabled: true, plan: 'free' } } });
    const fable = (obs = {}) => candidatesFor(BUNDLED, 'claude', p, obs).find(c => c.modelId === 'anthropic/claude-fable-5.1')!;
    expect(fable().plan).toBeUndefined();                      // Fable is not in the free plan table
    const seen = { claude: { models: ['anthropic/claude-fable-5.1'], at: '2026-10-12' } };
    expect(fable(seen).plan).toBe('free');
    expect(fable(seen).capWeight).toBe(5);
    expect(candidatesFor(BUNDLED, 'claude', prefs(), seen).find(c => c.modelId === 'anthropic/claude-fable-5.1')!.plan).toBeUndefined();   // no plan set: still pay per use
  });
  it.each([
    [{ ...BUNDLED, schemaVersion: 2 }, /schemaVersion/],
    [{ ...BUNDLED, models: { ...BUNDLED.models, x: { ...BUNDLED.models['anthropic/claude-haiku-5.5'], strengths: { code: 1.5 } } } }, /0\.\.1/],
    [{ ...BUNDLED, services: { ...BUNDLED.services, claude: { ...BUNDLED.services.claude!, models: [{ modelId: 'nope', label: 'x' }] } } }, /not in models/],
    [{ ...BUNDLED, services: { ...BUNDLED.services, claude: { ...BUNDLED.services.claude!, selectors: { composer: ['div[['] } } } }, /bad selector/],
  ])('rejects broken catalogs', (bad, msg) => {
    expect(() => validateCatalog(bad)).toThrow(msg);
  });
  it('resolves picker labels through aliases', () => {
    expect(resolveModelLabel(BUNDLED, 'claude', 'Sonnet 5.5')).toBe('anthropic/claude-sonnet-5.5');
    expect(resolveModelLabel(BUNDLED, 'claude', 'Claude Haiku 5.5 ▾')).toBe('anthropic/claude-haiku-5.5');
    expect(resolveModelLabel(BUNDLED, 'chatgpt', 'ChatGPT 6.1 Sol Pro')).toBe('openai/gpt-6.1-sol-pro');
    expect(resolveModelLabel(BUNDLED, 'chatgpt', 'Auto')).toBeNull();
    expect(resolveModelLabel(BUNDLED, 'claude', '')).toBeNull();
  });
  it('annotates candidates with the user plan and lists other enabled services', () => {
    const p = prefs({ services: { claude: { enabled: true, plan: 'pro' }, gemini: { enabled: true }, chatgpt: { enabled: false } } });
    const here = candidatesFor(BUNDLED, 'claude', p);
    expect(here.find(c => c.modelId === 'anthropic/claude-haiku-5.5')?.plan).toBe('pro');
    const other = candidatesElsewhere(BUNDLED, 'claude', p);
    expect(new Set(other.map(c => c.serviceId))).toEqual(new Set(['gemini']));
  });
});

describe('validateRule', () => {
  it('accepts a good rule and rejects bad ones', () => {
    expect(validateRule({ id: 'r', when: { task: 'chat' }, then: { prefer: 'x' } }).id).toBe('r');
    expect(() => validateRule({ id: 'r', when: { task: 'nope' }, then: { prefer: 'x' } })).toThrow(/unknown task/);
    expect(() => validateRule({ id: 'r', when: {}, then: {} })).toThrow(/prefer or exclude/);
    expect(() => validateRule({ id: 'r', when: {}, then: { prefer: 'x', boost: 3 } })).toThrow(/boost/);
  });
});
