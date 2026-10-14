// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '../../src/content/badge';
import { Cloud } from '../../src/content/cloud';
import { readTheme } from '../../src/content/theme';
import { BUNDLED } from '../../src/catalog/index';
import { explain } from '../../src/analyser/explain';
import type { Suggestion } from '../../src/shared/types';
import { loadFixture } from './helpers';

function fakeSuggestion(): Suggestion {
  const model = BUNDLED.models['anthropic/claude-haiku-5.5']!;
  const here = { key: 'anthropic/claude-haiku-5.5', modelId: 'anthropic/claude-haiku-5.5', serviceId: 'claude', label: 'Haiku 5.5', model, fit: 0.9, cost: { kind: 'api' as const, usd: 0.0012, tokensOut: 150 }, costScore: 1, total: 0.95, reasons: [] };
  return { id: 's1', here, isCurrent: false, classification: { primary: 'chat', weights: { chat: 1 }, tokensIn: 20, size: 'short', signals: [], sensitive: [] }, ranked: [here] };
}

describe('badge and cloud', () => {
  beforeEach(() => {
    loadFixture('claude', 'claude.ai');
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
    (globalThis as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  });

  it('badge lives in body, not in the composer, and shows the suggestion', () => {
    const fieldset = document.querySelector('fieldset')!;
    const theme = readTheme(fieldset.querySelector('[contenteditable]')!, fieldset);
    const badge = new Badge({ element: fieldset, corner: 'top-right' }, theme);
    expect(badge.host.parentElement).toBe(document.body);
    expect(fieldset.contains(badge.host)).toBe(false);
    badge.update(fakeSuggestion(), BUNDLED);
    const text = badge.host.shadowRoot!.textContent!;
    expect(text).toContain('Suggest:');
    expect(text).toContain('Haiku 5.5');
    expect(text).toContain('~$0.001');
    const why = vi.fn();
    badge.onWhy(why);
    badge.host.shadowRoot!.querySelector('button')!.click();
    expect(why).toHaveBeenCalled();
    badge.destroy();
    expect(document.body.contains(badge.host)).toBe(false);
  });

  it('cloud renders the explanation, places itself and closes on Escape', () => {
    const fieldset = document.querySelector('fieldset')!;
    const theme = readTheme(fieldset, fieldset);
    const cloud = new Cloud(theme);
    const x = explain(fakeSuggestion(), BUNDLED);
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
    cloud.open(x, { left: 300, right: 1100, top: 0, bottom: 900, width: 800, height: 900 }, { left: 320, right: 1080, top: 600, bottom: 680, width: 760, height: 80 });
    expect(cloud.isOpen).toBe(true);
    expect(cloud.host.dataset.mode).toBe('margin');
    const t = cloud.host.shadowRoot!.textContent!;
    expect(t).toContain('quick chat');
    expect(t).toContain('Haiku 5.5');
    const vote = vi.fn();
    cloud.onFeedback(vote);
    [...cloud.host.shadowRoot!.querySelectorAll('button')].find(b => b.title === 'Good suggestion')!.click();
    expect(vote).toHaveBeenCalledWith('up');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cloud.isOpen).toBe(false);
    cloud.destroy();
  });
});
