import type { Attachment } from '../shared/types';
import { allAliases } from '../catalog/aliases';
import {
  containerOf, idFor, isVisibleDefault, makeHandle, nearestSendButton, readComposerText, textOf,
  type AdapterDeps, type ComposerHandle, type SiteAdapter,
} from './adapter';

const COMPOSER = 'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"][aria-label], [contenteditable="true"][data-placeholder], [contenteditable="true"].ProseMirror, [contenteditable="true"].ql-editor';

/** Heuristic adapter for self-hosted UIs (Open WebUI, LibreChat, ...). Always last in the registry. */
export function generic(deps: AdapterDeps, id = 'generic'): SiteAdapter {
  const visible = deps.isVisible ?? isVisibleDefault;
  const aliases = () => allAliases(deps.catalog).map(a => a.toLowerCase());

  return {
    id,
    detect: () => true,
    composers: (root = document) => {
      const out: ComposerHandle[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(COMPOSER)) {
        if (!visible(el)) continue;
        if ((el as HTMLTextAreaElement).readOnly || el.getAttribute('aria-readonly') === 'true') continue;
        if (el.closest('euboulia-badge, euboulia-cloud')) continue;
        if (out.some(h => h.element.contains(el) || el.contains(h.element))) continue;
        const send = nearestSendButton(el);
        if (!send && !el.closest('form')) continue;
        out.push(makeHandle(el, containerOf(el, send), send));
      }
      return out;
    },
    readText: readComposerText,
    currentModel: (c) => {
      const names = aliases();
      let scope: Element | null = c.container;
      for (let i = 0; i < 6 && scope; i++) {
        for (const b of scope.querySelectorAll('button[aria-haspopup], [role="combobox"], select, button[aria-expanded]')) {
          const t = b.tagName === 'SELECT' ? textOf((b as HTMLSelectElement).selectedOptions[0] ?? null) : textOf(b);
          const low = t.toLowerCase();
          if (t && names.some(n => n && low.includes(n))) return t;
        }
        scope = scope.parentElement;
      }
      return null;
    },
    models: () => [],
    attachments: (c) => {
      const out: Attachment[] = [];
      for (const img of c.container.querySelectorAll('img')) {
        if (img.closest('button') || img.width < 24 && img.height < 24) continue;
        out.push({ kind: 'image', name: img.alt || undefined });
      }
      for (const chip of c.container.querySelectorAll('[aria-label*="remove" i], [aria-label*="delete" i]')) {
        if (!chip.closest('button')?.querySelector('img') && !out.length) out.push({ kind: 'file' });
      }
      return out;
    },
    anchor: (c) => ({ element: c.container, corner: 'top-right' }),
    contentColumn: (c) => c.container.closest('main, form') ?? c.container,
  };
}

export { idFor };
