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
  it('effort advice is sourced and names only levels the model accepts', () => {
    let advised = 0;
    for (const [pid, prov] of Object.entries(facts.providers) as [string, any][]) {
      const ids: string[] = prov.effortLevels.ids;
      const g = prov.effortGuidance;
      expect(g, `${pid} effortGuidance`).toBeDefined();
      expect(prov.sources[g.source], `${pid} effortGuidance source`).toBeDefined();
      for (const id of Object.keys(g.levels)) expect(ids, `${pid} guidance level ${id}`).toContain(id);
      for (const [id, m] of Object.entries(prov.models) as [string, any][]) {
        if (m.defaultEffort) expect(m.sources.defaultEffort ?? m.sources.efforts, `${id} defaultEffort source`).toBeDefined();
        for (const e of m.efforts ?? []) expect(ids, `${id} effort ${e}`).toContain(e);
        const a = m.effortAdvice;
        if (!a) continue;
        advised++;
        expect(m.sources.effortAdvice, `${id} effortAdvice source`).toBeDefined();
        expect(m.efforts, `${id} start`).toContain(a.start);
        for (const w of a.when ?? []) {
          expect(w.for, `${id} when.for`).toMatch(/\S/);
          for (const e of w.efforts) expect(m.efforts, `${id} advice ${e}`).toContain(e);
        }
      }
    }
    expect(advised).toBeGreaterThanOrEqual(10);
  });
  it('the effort advice agrees with the documented defaults it was read alongside', () => {
    const a = facts.providers.anthropic.models as any;
    expect(a['anthropic/claude-opus-5.5'].effortAdvice.start).toBe(a['anthropic/claude-opus-5.5'].defaultEffort);
    expect(a['anthropic/claude-sonnet-5.5'].effortAdvice.start).toBe('high');
    expect(a['anthropic/claude-sonnet-4.6'].effortAdvice.start).toBe('medium'); // docs recommend medium over the high default
    const g = facts.providers.google.models as any;
    expect(g['google/gemini-4-argon'].efforts).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    expect(g['google/gemini-3.5-flash-lite'].defaultEffort).toBe('MINIMAL');
    expect((facts.providers.openai.models as any)['openai/gpt-6-astra'].sources.defaultEffort).toBe('latest-model');
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
