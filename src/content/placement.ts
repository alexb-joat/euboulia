export interface Rect { top: number; right: number; bottom: number; left: number; width: number; height: number }
export interface Viewport { width: number; height: number }

export const MIN_MARGIN = 280;
export const GUTTER = 16;
export const MAX_WIDTH = 360;
export const CLOUD_HEIGHT_GUESS = 320;

export type Placement =
  | { mode: 'margin'; left: number; top: number; width: number }
  | { mode: 'dock'; right: number; bottom: number; width: number };

/** Put the cloud in the blank right margin if there is one, else dock it bottom-right. */
export function computeCloudPlacement(vp: Viewport, content: Rect, composer: Rect, prefs: { collapsedByDefault?: boolean } = {}): Placement & { collapsed: boolean } {
  const gap = vp.width - content.right;
  if (gap >= MIN_MARGIN) {
    const width = Math.min(gap - 2 * GUTTER, MAX_WIDTH);
    const top = Math.max(GUTTER, Math.min(composer.top - 8, vp.height - CLOUD_HEIGHT_GUESS - GUTTER));
    return { mode: 'margin', left: content.right + GUTTER, top, width, collapsed: false };
  }
  // Above the composer when there is room for the whole cloud; otherwise the bottom corner, so it never leaves the viewport.
  const roomAbove = composer.top - 2 * GUTTER;
  return {
    mode: 'dock', right: GUTTER,
    bottom: roomAbove >= CLOUD_HEIGHT_GUESS ? Math.max(GUTTER, vp.height - composer.top + GUTTER) : GUTTER,
    width: Math.min(MAX_WIDTH, vp.width - 2 * GUTTER),
    collapsed: !!prefs.collapsedByDefault,
  };
}
