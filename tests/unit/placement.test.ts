import { describe, expect, it } from 'vitest';
import { CLOUD_HEIGHT_GUESS, MIN_MARGIN, computeCloudPlacement } from '../../src/content/placement';

const rect = (left: number, right: number, top = 600, bottom = 680) => ({ left, right, top, bottom, width: right - left, height: bottom - top });

describe('computeCloudPlacement', () => {
  it('uses the right margin when there is room', () => {
    const p = computeCloudPlacement({ width: 1600, height: 900 }, rect(300, 1100), rect(320, 1080));
    expect(p.mode).toBe('margin');
    if (p.mode === 'margin') { expect(p.left).toBe(1116); expect(p.width).toBe(360); expect(p.top).toBeLessThanOrEqual(600); }
  });
  it('docks when the margin is under the minimum', () => {
    const p = computeCloudPlacement({ width: 1100, height: 900 }, rect(100, 1100 - MIN_MARGIN + 1), rect(120, 800), { collapsedByDefault: true });
    expect(p.mode).toBe('dock');
    expect(p.collapsed).toBe(true);
    const q = computeCloudPlacement({ width: 1100, height: 900 }, rect(100, 1100 - MIN_MARGIN), rect(120, 800));
    expect(q.mode).toBe('margin');
  });
  it('clamps top inside the viewport', () => {
    const p = computeCloudPlacement({ width: 1600, height: 400 }, rect(300, 1100), rect(320, 1080, 380, 395));
    if (p.mode === 'margin') expect(p.top).toBe(400 - CLOUD_HEIGHT_GUESS - 16);
  });
  it('docks above a low composer but never runs off the top for a high one', () => {
    const vp = { width: 1100, height: 800 };
    const low = computeCloudPlacement(vp, rect(100, 1100), rect(120, 1000, 650, 730));
    expect(low.mode === 'dock' && low.bottom).toBe(800 - 650 + 16);
    const high = computeCloudPlacement(vp, rect(100, 1100), rect(120, 1000, 185, 265));
    expect(high.mode).toBe('dock');
    if (high.mode === 'dock') expect(vp.height - high.bottom - CLOUD_HEIGHT_GUESS).toBeGreaterThanOrEqual(0);
  });
});
