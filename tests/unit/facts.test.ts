// The provider-facts file is the contract Ninshubur fills: every figure must carry a source,
// and the bundled catalog must reflect it (long-context tiers, statuses, documented effort ids).
import { describe, expect, it } from 'vitest';
import facts from '../../src/catalog/provider-facts.json';
import { apiUsd } from '../../src/analyser/cost';
import { validateCatalog } from '../../src/catalog/schema';
import { BUNDLED } from '../../src/catalog/index';

describe('provider facts', () => {
  it('every model fact names a source for each field it sets, and the source exists', () => {
    for (const [pid, prov] of Object.entries(facts.providers)) {
      for (const [id, m] of Object.entries(prov.models)) {
        expect(m.sources.price, `${id} price source`).toBeDefined();
        expect(m.sources.status, `${id} status source`).toBeDefined();
        for (const key of Object.values(m.sources)) expect(prov.sources[key as keyof typeof prov.sources], `${pid}:${id} source ${key}`).toBeDefined();
        if ((m as any).efforts) expect(m.sources.efforts, `${id} efforts source`).toBeDefined();
        if ((m as any).price.longContext) expect(m.sources.longContext, `${id} longContext source`).toBeDefined();
      }
    }
  });
  it('the bundled catalog carries the facts: prices, tiers, status, efforts, sources', () => {
    const haiku = BUNDLED.models['anthropic/claude-haiku-5.5']!;
    expect(haiku.price).toEqual({ input: 0.1, output: 0.5, longContext: { threshold: 100000, input: 0.5, output: 2.5 } });
    expect(haiku.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(haiku.defaultEffort).toBe('medium');
    expect(haiku.sources!.find(s => s.field === 'price')!.url).toContain('platform.claude.com');
    const astra = BUNDLED.models['openai/gpt-6-astra']!;
    expect(astra.price!.longContext).toEqual({ threshold: 272000, input: 20, output: 75 });
    expect(astra.context).toBe(1050000);
    expect(astra.sources!.find(s => s.field === 'price')!.url).toBe('https://developers.openai.com/docs/models/gpt-6-astra');
    expect(BUNDLED.models['openai/gpt-5.5']!.status).toBe('retired');
    expect(BUNDLED.models['anthropic/claude-sonnet-4.5']!.status).toBe('deprecated');
    expect(BUNDLED.factsGeneratedAt).toBe(facts.generatedAt);
  });
  it('long prompts are priced at the higher tier for the whole request', () => {
    const haiku = BUNDLED.models['anthropic/claude-haiku-5.5']!;
    expect(apiUsd(haiku, 50_000, 1000)).toBeCloseTo((50_000 * 0.1 + 1000 * 0.5) / 1e6, 9);
    expect(apiUsd(haiku, 150_000, 1000)).toBeCloseTo((150_000 * 0.5 + 1000 * 2.5) / 1e6, 9);
    const astra = BUNDLED.models['openai/gpt-6-astra']!;
    expect(apiUsd(astra, 300_000, 1000)).toBeCloseTo((300_000 * 20 + 1000 * 75) / 1e6, 9);
  });
  it('a site cannot offer an effort level the provider does not document for the model', () => {
    const bad = structuredClone(BUNDLED) as any;
    bad.services.claude.models.find((m: any) => m.modelId === 'anthropic/claude-opus-4.6').efforts.push('xhigh');
    expect(() => validateCatalog(bad)).toThrow(/not documented/);
  });
});
