import type { Attachment, Catalog, ServiceSelectors } from '../shared/types';

export interface ComposerHandle {
  id: string;
  element: HTMLElement;              // textarea or contenteditable
  kind: 'textarea' | 'contenteditable';
  container: HTMLElement;            // wrapper holding the send button and attachment chips
  sendButton: HTMLElement | null;
}

export interface ModelOffer { label: string; selected: boolean }

export interface Anchor { element: Element; corner: 'top-right' | 'bottom-right' | 'bottom-left' }

export interface SiteAdapter {
  id: string;
  detect(doc: Document, loc: Location): boolean;
  composers(root?: ParentNode): ComposerHandle[];
  readText(c: ComposerHandle): string;
  currentModel(c: ComposerHandle): string | null;
  models(c: ComposerHandle): ModelOffer[];
  attachments(c: ComposerHandle): Attachment[];
  anchor(c: ComposerHandle): Anchor;
  contentColumn(c: ComposerHandle): Element;
}

export interface AdapterDeps {
  catalog: Catalog;
  isVisible?: (el: Element) => boolean;   // injectable for jsdom
}

// --- helpers --------------------------------------------------------------

const ids = new WeakMap<Element, string>();
let nextId = 1;
export function idFor(el: Element): string {
  let id = ids.get(el);
  if (!id) { id = `c${nextId++}`; ids.set(el, id); }
  return id;
}

export function isVisibleDefault(el: Element): boolean {
  const h = el as HTMLElement;
  if (!h.isConnected) return false;
  if (typeof h.getClientRects !== 'function') return true;
  const rect = h.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 8) return false;
  const cs = getComputedStyle(h);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

export function queryFirst<T extends Element = Element>(root: ParentNode, selectors: string[] | undefined): T | null {
  for (const s of selectors ?? []) {
    try { const el = root.querySelector<T>(s); if (el) return el; } catch { /* bad selector */ }
  }
  return null;
}

export function queryAll<T extends Element = Element>(root: ParentNode, selectors: string[] | undefined): T[] {
  const out: T[] = [];
  const seen = new Set<Element>();
  for (const s of selectors ?? []) {
    try {
      for (const el of root.querySelectorAll<T>(s)) if (!seen.has(el)) { seen.add(el); out.push(el); }
    } catch { /* bad selector */ }
  }
  return out;
}

export function textOf(el: Element | null): string {
  if (!el) return '';
  const h = el as HTMLElement;
  return (h.innerText ?? h.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function nearestSendButton(el: Element): HTMLElement | null {
  const SEND = 'button[type="submit"], button[aria-label*="send" i], button[data-testid*="send" i], button[title*="send" i]';
  let node: Element | null = el.closest('form');
  if (!node) {
    node = el;
    for (let i = 0; i < 5 && node.parentElement; i++) node = node.parentElement;
  }
  return node.querySelector<HTMLElement>(SEND);
}

export function readComposerText(c: ComposerHandle): string {
  if (c.kind === 'textarea') return (c.element as HTMLTextAreaElement).value;
  const t = (c.element as HTMLElement).innerText ?? c.element.textContent ?? '';
  return t.replace(/​/g, '');
}

export function makeHandle(el: HTMLElement, container: HTMLElement, sendButton: HTMLElement | null): ComposerHandle {
  return {
    id: idFor(el), element: el,
    kind: el.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable',
    container, sendButton,
  };
}

export function containerOf(el: HTMLElement, sendButton: HTMLElement | null): HTMLElement {
  const form = el.closest<HTMLElement>('form, fieldset');
  if (form) return form;
  if (sendButton) {
    let a: HTMLElement | null = el;
    while (a && !a.contains(sendButton)) a = a.parentElement;
    if (a && a !== document.body) return a;
  }
  return el.parentElement ?? el;
}

// --- factory --------------------------------------------------------------

export interface AdapterSpec {
  id: string;
  hosts: string[];
  selectors: ServiceSelectors;   // compiled fallback; the catalog's copy wins when present
}

export function makeAdapter(spec: AdapterSpec, deps: AdapterDeps): SiteAdapter {
  const visible = deps.isVisible ?? isVisibleDefault;
  const sel = (): ServiceSelectors => ({ ...spec.selectors, ...(deps.catalog.services[spec.id]?.selectors ?? {}) });
  const hosts = () => [...spec.hosts, ...(deps.catalog.services[spec.id]?.hosts ?? [])];

  const adapter: SiteAdapter = {
    id: spec.id,
    detect: (_doc, loc) => hosts().some(h => loc.hostname === h || loc.hostname.endsWith('.' + h)),
    composers: (root = document) => {
      const out: ComposerHandle[] = [];
      for (const el of queryAll<HTMLElement>(root, sel().composer)) {
        if (!visible(el)) continue;
        if (out.some(h => h.element.contains(el) || el.contains(h.element))) continue;
        const send = queryFirst<HTMLElement>(el.closest('form, fieldset') ?? root, sel().sendButton) ?? nearestSendButton(el);
        out.push(makeHandle(el, containerOf(el, send), send));
      }
      return out;
    },
    readText: readComposerText,
    currentModel: (c) => {
      // Nearest picker first, so each pane of a multi-composer page reads its own model.
      let scope: Element | null = c.container;
      for (let i = 0; i < 8 && scope && scope !== document.body; i++) {
        const btn = queryFirst(scope, sel().modelPicker);
        if (btn) return textOf(btn) || null;
        scope = scope.parentElement;
      }
      const btn = queryFirst(document, sel().modelPicker);
      return btn ? textOf(btn) || null : null;
    },
    models: () => {
      const items = queryAll(document, sel().pickerOpen);
      return items.map(el => ({ label: textOf(el), selected: el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || !!el.querySelector('[data-state="checked"], svg[aria-label*="selected" i]') }))
        .filter(o => o.label);
    },
    attachments: (c) => {
      const out: Attachment[] = [];
      for (const el of queryAll(c.container, sel().attachments)) {
        if (el.closest('button') && el.tagName === 'IMG') continue;
        const isImg = el.tagName === 'IMG' || !!el.querySelector('img') || /image|photo|png|jpe?g|webp|gif/i.test(el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? '');
        out.push({ kind: isImg ? 'image' : 'file', name: el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? undefined });
      }
      return out;
    },
    anchor: (c) => ({ element: c.container, corner: 'top-right' }),
    contentColumn: (c) => queryFirst(document, sel().contentColumn) ?? c.container.closest('main, form') ?? c.container,
  };
  return adapter;
}
