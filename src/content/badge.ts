import type { Catalog, Suggestion } from '../shared/types';
import { formatCost } from '../analyser/cost';
import { planName } from '../analyser/explain';
import { BADGE_CSS, adoptStyles } from './styles';
import { themeVars, type Theme } from './theme';
import type { Anchor } from '../sites/adapter';

// Site popups (model menus, dropdowns, dialogs). When one covers the badge, the badge steps aside: the page's own
// menu must never sit under our pill.
const POPUP = '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-side][data-state="open"]';

export class Badge {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private pill: HTMLButtonElement;
  private main: HTMLSpanElement;
  private alt: HTMLSpanElement;
  private shield: HTMLSpanElement;
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
    this.main = document.createElement('span');
    this.main.className = 'main';
    const why = document.createElement('span');
    why.className = 'why';
    why.textContent = 'why?';
    this.alt = document.createElement('span');
    this.alt.className = 'alt';
    this.alt.hidden = true;
    this.pill.append(this.shield, this.main, why, this.alt);
    this.pill.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.onWhyCb?.(); });
    this.root.appendChild(this.pill);
    this.setTheme(theme);
    document.body.appendChild(this.host);
    this.ro = new ResizeObserver(() => this.place());
    this.ro.observe(anchor.element);
    addEventListener('scroll', this.scheduledPlace, { capture: true, passive: true });
    addEventListener('resize', this.scheduledPlace, { passive: true });
  }

  onWhy(cb: () => void): void { this.onWhyCb = cb; }

  setTheme(t: Theme): void { this.host.style.cssText = themeVars(t); }

  update(s: Suggestion, catalog: Catalog, serviceId?: string): void {
    const costStr = formatCost(s.here.cost, planName(catalog, s.here));
    this.main.replaceChildren();
    const b = document.createElement('b');
    b.textContent = s.here.label;
    const where = serviceId && s.here.serviceId !== serviceId ? ` on ${catalog.services[s.here.serviceId]?.name ?? s.here.serviceId}` : '';
    this.main.append(s.isCurrent ? 'Good pick: ' : 'Suggest: ', b, `${where} · ${costStr}`);
    this.shield.hidden = s.classification.sensitive.length === 0;
    if (s.elsewhere) {
      const svc = catalog.services[s.elsewhere.serviceId]?.name ?? s.elsewhere.serviceId;
      this.alt.textContent = `or ${s.elsewhere.label} on ${svc} · ${formatCost(s.elsewhere.cost, planName(catalog, s.elsewhere))}`;
      this.alt.hidden = false;
    } else {
      this.alt.hidden = true;
    }
    this.host.hidden = false;
    this.place();
  }

  hide(): void { this.host.hidden = true; }

  get rect(): DOMRect { return this.pill.getBoundingClientRect(); }

  private scheduledPlace = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.place(); });
  };

  place(): void {
    if (this.host.hidden) return;
    const r = this.anchor.element.getBoundingClientRect();
    const w = this.pill.offsetWidth, h = this.pill.offsetHeight;
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
    const r = this.pill.getBoundingClientRect();
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
    this.ro?.disconnect();
    removeEventListener('scroll', this.scheduledPlace, { capture: true } as EventListenerOptions);
    removeEventListener('resize', this.scheduledPlace);
    this.host.remove();
  }
}
