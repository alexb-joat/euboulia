import type { Catalog, Suggestion } from '../shared/types';
import { costLabel, effortNotice, limitTitle } from '../analyser/explain';
import { BADGE_CSS, adoptStyles } from './styles';
import { themeVars, type Theme } from './theme';
import type { Anchor } from '../sites/adapter';

// Site popups (model menus, dropdowns, dialogs). When one covers the badge, the badge steps aside: the page's own
// menu must never sit under our pill.
const POPUP = '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-side][data-state="open"]';

/** A button on the status line, e.g. "Switch back". */
export interface StatusAction { label: string; title?: string; run: () => void }

export class Badge {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private stack: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private statusTimer?: ReturnType<typeof setTimeout>;
  private pill: HTMLButtonElement;
  private main: HTMLSpanElement;
  private alt: HTMLSpanElement;
  private shield: HTMLSpanElement;
  private note: HTMLSpanElement;
  private anchor: Anchor;
  private ro?: ResizeObserver;
  private onWhyCb?: () => void;
  private raf = 0;

  constructor(anchor: Anchor, theme: Theme) {
    this.anchor = anchor;
    this.host = document.createElement('euboulia-badge');
    this.host.hidden = true;
    this.root = this.host.attachShadow({ mode: 'open' });
    adoptStyles(this.root, BADGE_CSS);
    this.pill = document.createElement('button');
    this.pill.className = 'pill';
    this.pill.type = 'button';
    this.pill.setAttribute('aria-live', 'polite');
    this.shield = document.createElement('span');
    this.shield.className = 'shield';
    this.shield.title = 'Sensitive data detected in the prompt';
    this.shield.textContent = '⚿';
    this.shield.hidden = true;
    this.note = document.createElement('span');
    this.note.className = 'note';
    this.note.hidden = true;
    this.main = document.createElement('span');
    this.main.className = 'main';
    const why = document.createElement('span');
    why.className = 'why';
    why.textContent = 'why?';
    this.alt = document.createElement('span');
    this.alt.className = 'alt';
    this.alt.hidden = true;
    this.pill.append(this.shield, this.note, this.main, why, this.alt);
    this.pill.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.onWhyCb?.(); });
    // What "Choose for me" did, above the pill: it outlives the pill, which hides once the composer is empty.
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'status';
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.hidden = true;
    this.stack = document.createElement('div');
    this.stack.className = 'stack';
    this.stack.append(this.statusEl, this.pill);
    this.root.appendChild(this.stack);
    this.setTheme(theme);
    document.body.appendChild(this.host);
    this.ro = new ResizeObserver(() => this.place());
    this.ro.observe(anchor.element);
    addEventListener('scroll', this.scheduledPlace, { capture: true, passive: true });
    addEventListener('resize', this.scheduledPlace, { passive: true });
  }

  onWhy(cb: () => void): void { this.onWhyCb = cb; }

  setTheme(t: Theme): void { this.host.style.cssText = themeVars(t); }

  /** `willSend`: "Choose for me" will switch to this option on send, so the pill names it as the one sending. */
  update(s: Suggestion, catalog: Catalog, serviceId?: string, willSend = false): void {
    const costStr = costLabel(catalog, s.here, true);
    this.main.replaceChildren();
    const b = document.createElement('b');
    b.textContent = s.here.label;
    const where = serviceId && s.here.serviceId !== serviceId ? ` on ${catalog.services[s.here.serviceId]?.name ?? s.here.serviceId}` : '';
    this.main.append(s.isCurrent ? 'Good pick: ' : willSend ? 'Sending with: ' : 'Suggest: ', b, `${where} · ${costStr}`);
    this.shield.hidden = s.classification.sensitive.length === 0;
    const notice = effortNotice(s, catalog);
    this.note.hidden = !notice;
    this.note.textContent = notice?.text ?? '';
    this.note.title = notice?.title ?? '';
    const title = limitTitle(catalog, s.here);
    if (title) this.pill.title = title; else this.pill.removeAttribute('title');
    if (s.elsewhere) {
      const svc = catalog.services[s.elsewhere.serviceId]?.name ?? s.elsewhere.serviceId;
      this.alt.textContent = `or ${s.elsewhere.label} on ${svc} · ${costLabel(catalog, s.elsewhere, true)}`;
      this.alt.hidden = false;
    } else {
      this.alt.hidden = true;
    }
    this.pill.hidden = false;
    this.host.hidden = false;
    this.place();
  }

  hide(): void {
    this.pill.hidden = true;
    this.host.hidden = this.statusEl.hidden;
    this.place();
  }

  /**
   * Show a status line above the pill ("Sent with Sonnet 5.5 · Medium [Switch back]"). It stays until replaced,
   * cleared, an action is chosen, or `ttlMs` passes.
   */
  status(text: string, actions: StatusAction[] = [], ttlMs = 0, busy = false): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = undefined;
    const span = document.createElement('span');
    span.textContent = text;
    this.statusEl.replaceChildren(span);
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      if (a.title) btn.title = a.title;
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); a.run(); });
      this.statusEl.append(btn);
    }
    this.statusEl.toggleAttribute('aria-busy', busy);
    this.statusEl.hidden = false;
    this.host.hidden = false;
    if (ttlMs > 0) this.statusTimer = setTimeout(() => this.clearStatus(), ttlMs);
    this.place();
  }

  clearStatus(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = undefined;
    this.statusEl.hidden = true;
    this.statusEl.replaceChildren();
    this.host.hidden = this.pill.hidden;
    this.place();
  }

  get statusText(): string { return this.statusEl.hidden ? '' : this.statusEl.textContent ?? ''; }

  get rect(): DOMRect { return this.pill.getBoundingClientRect(); }

  private scheduledPlace = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.place(); });
  };

  place(): void {
    if (this.host.hidden) return;
    const r = this.anchor.element.getBoundingClientRect();
    const w = this.stack.offsetWidth, h = this.stack.offsetHeight;
    let top: number, left: number;
    switch (this.anchor.corner) {
      case 'top-right': top = r.top - h - 6; left = r.right - w; break;
      case 'bottom-right': top = r.bottom + 6; left = r.right - w; break;
      case 'bottom-left': top = r.bottom + 6; left = r.left; break;
    }
    if (top < 4) top = r.top + 6;
    left = Math.max(4, Math.min(left, innerWidth - w - 4));
    this.host.style.top = `${top + scrollY}px`;
    this.host.style.left = `${left + scrollX}px`;
    this.host.toggleAttribute('obscured', this.coveredByPopup());
  }

  /** True when a site popup lies under (and visually would sit over) any part of the pill. */
  private coveredByPopup(): boolean {
    if (typeof document.elementsFromPoint !== 'function') return false;
    const r = this.stack.getBoundingClientRect();
    if (!r.width) return false;
    const y = r.top + r.height / 2;
    for (const x of [r.left + 4, r.left + r.width / 2, r.right - 4]) {
      const under = document.elementsFromPoint(x, y).find(el => el !== this.host && !this.host.contains(el));
      const popup = under?.closest(POPUP);
      if (popup && !popup.contains(this.anchor.element)) return true;
    }
    return false;
  }

  destroy(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.ro?.disconnect();
    removeEventListener('scroll', this.scheduledPlace, { capture: true } as EventListenerOptions);
    removeEventListener('resize', this.scheduledPlace);
    this.host.remove();
  }
}
