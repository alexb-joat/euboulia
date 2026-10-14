import { describe, expect, it, vi } from 'vitest';
import { missingOrigins, requestMissing, supportedOrigins } from '../../src/shared/access';
import { BUNDLED } from '../../src/catalog/index';

const fakePerms = (granted: Set<string>, answer = true) => ({
  contains: vi.fn(async ({ origins }: { origins: string[] }) => origins.every(o => granted.has(o))),
  request: vi.fn(async ({ origins }: { origins: string[] }) => { if (answer) origins.forEach(o => granted.add(o)); return answer; }),
});

describe('site access', () => {
  it('lists one https pattern per catalog host', () => {
    const o = supportedOrigins(BUNDLED);
    expect(o).toContain('https://claude.ai/*');
    expect(o).toContain('https://www.perplexity.ai/*');
    expect(new Set(o).size).toBe(o.length);
  });
  it('Chrome-like: everything granted, nothing missing, no prompt', async () => {
    const p = fakePerms(new Set(supportedOrigins(BUNDLED)));
    expect(await missingOrigins(BUNDLED, p)).toEqual([]);
    expect(await requestMissing(BUNDLED, p)).toBe(true);
    expect(p.request).not.toHaveBeenCalled();
  });
  it('Firefox-like: nothing granted, one prompt for all missing sites', async () => {
    const p = fakePerms(new Set(['https://claude.ai/*']));
    const missing = await missingOrigins(BUNDLED, p);
    expect(missing).not.toContain('https://claude.ai/*');
    expect(missing.length).toBe(supportedOrigins(BUNDLED).length - 1);
    expect(await requestMissing(BUNDLED, p)).toBe(true);
    expect(p.request).toHaveBeenCalledTimes(1);
    expect(await missingOrigins(BUNDLED, p)).toEqual([]);
  });
  it('a refused prompt leaves the sites missing', async () => {
    const p = fakePerms(new Set(), false);
    expect(await requestMissing(BUNDLED, p)).toBe(false);
    expect((await missingOrigins(BUNDLED, p)).length).toBeGreaterThan(0);
  });
  it('a broken permissions API does not block anything', async () => {
    const p = { contains: async () => { throw new Error('nope'); }, request: async () => false };
    expect(await missingOrigins(BUNDLED, p)).toEqual([]);
  });
});
