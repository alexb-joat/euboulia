// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerRegistry, SCAN_COALESCE_MS } from '../../src/content/registry';
import { pickAdapter } from '../../src/sites/registry';
import { deps, loadFixture } from './helpers';

describe('ComposerRegistry', () => {
  beforeEach(() => { vi.useFakeTimers(); loadFixture('claude', 'claude.ai'); });
  afterEach(() => { vi.useRealTimers(); });

  it('attaches once, detaches on removal and re-attaches after a re-render', async () => {
    const attach = vi.fn((c) => ({ c }));
    const detach = vi.fn();
    const reg = new ComposerRegistry(pickAdapter(deps), { attach, detach });
    reg.start();
    expect(attach).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(1);

    const fieldset = document.querySelector('fieldset')!;
    const clone = fieldset.cloneNode(true) as HTMLElement;
    fieldset.remove();
    await vi.advanceTimersByTimeAsync(SCAN_COALESCE_MS + 10);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);

    document.querySelector('main')!.append(clone);
    await vi.advanceTimersByTimeAsync(SCAN_COALESCE_MS + 10);
    expect(attach).toHaveBeenCalledTimes(2);
    expect(reg.size).toBe(1);
    reg.stop();
    expect(detach).toHaveBeenCalledTimes(2);
  });

  it('calls the scanned hook with the live composers after every scan', async () => {
    const scanned = vi.fn();
    const reg = new ComposerRegistry(pickAdapter(deps), { attach: c => c, detach: () => {}, scanned });
    reg.start();
    expect(scanned).toHaveBeenCalledTimes(1);
    expect(scanned.mock.calls[0]![0]).toHaveLength(1);
    document.querySelector('main')!.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(SCAN_COALESCE_MS + 10);
    expect(scanned).toHaveBeenCalledTimes(2);
    reg.stop();
  });
});
