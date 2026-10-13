export interface Theme {
  fontFamily: string; fontSize: number; fg: string; bg: string; border: string; radius: string; dark: boolean;
}

function parseRgb(s: string): [number, number, number, number] | null {
  const m = s.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\)/);
  if (!m) return null;
  let a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (m[4]?.endsWith('%')) a /= 100;
  return [+m[1]!, +m[2]!, +m[3]!, a];
}

function luminance([r, g, b]: [number, number, number, number]): number {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function opaqueBackground(el: Element | null): string | null {
  for (let n = el; n; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    const p = parseRgb(bg);
    if (p && p[3] > 0.5) return bg;
  }
  return null;
}

export function readTheme(composer: Element, container: Element = composer): Theme {
  const cs = getComputedStyle(composer);
  const ccs = getComputedStyle(container);
  const bg = opaqueBackground(composer) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'rgb(24,24,24)' : 'rgb(255,255,255)');
  const p = parseRgb(bg);
  const dark = p ? luminance(p) < 0.4 : matchMedia('(prefers-color-scheme: dark)').matches;
  const size = parseFloat(cs.fontSize) || 14;
  const border = parseRgb(ccs.borderColor ?? '')?.[3] ? ccs.borderColor : (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)');
  return {
    fontFamily: cs.fontFamily || 'system-ui, sans-serif',
    fontSize: Math.max(11, Math.min(13, size - 1)),
    fg: cs.color || (dark ? 'rgb(235,235,235)' : 'rgb(20,20,20)'),
    bg, border, radius: ccs.borderRadius && ccs.borderRadius !== '0px' ? ccs.borderRadius : '10px', dark,
  };
}

export function themeVars(t: Theme): string {
  return `--eu-font:${t.fontFamily};--eu-size:${t.fontSize}px;--eu-fg:${t.fg};--eu-bg:${t.bg};--eu-border:${t.border};--eu-radius:${t.radius};` +
    `--eu-muted:color-mix(in srgb, ${t.fg} 58%, transparent);--eu-faint:color-mix(in srgb, ${t.fg} 8%, transparent);` +
    `--eu-shadow:${t.dark ? '0 6px 24px rgba(0,0,0,0.45)' : '0 6px 24px rgba(0,0,0,0.12)'};`;
}

/** Re-run cb when the site switches theme (class/data-theme on html/body) or the OS scheme flips. */
export function watchTheme(cb: () => void): () => void {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onMq = () => cb();
  mq.addEventListener('change', onMq);
  const mo = new MutationObserver(cb);
  for (const el of [document.documentElement, document.body]) {
    if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'data-theme', 'style', 'data-mode'] });
  }
  return () => { mq.removeEventListener('change', onMq); mo.disconnect(); };
}
