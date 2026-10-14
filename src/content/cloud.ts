import type { Explanation } from '../analyser/explain';
import { CLOUD_CSS, adoptStyles } from './styles';
import { computeCloudPlacement, type Rect } from './placement';
import { themeVars, type Theme } from './theme';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Cloud {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private box: HTMLElement;
  private onVote?: (v: 'up' | 'down') => void;
  private onCloseCb?: () => void;
  private collapsedByDefault: boolean;

  constructor(theme: Theme, collapsedByDefault = false) {
    this.collapsedByDefault = collapsedByDefault;
    this.host = document.createElement('euboulia-cloud');
    this.host.hidden = true;
    this.root = this.host.attachShadow({ mode: 'open' });
    adoptStyles(this.root, CLOUD_CSS);
    this.box = el('section', 'cloud');
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-label', 'Why this model');
    this.root.appendChild(this.box);
    this.setTheme(theme);
    document.body.appendChild(this.host);
    addEventListener('keydown', this.onKey, true);
    addEventListener('pointerdown', this.onOutside, true);
  }

  setTheme(t: Theme): void { this.host.style.cssText = themeVars(t); }
  get isOpen(): boolean { return !this.host.hidden; }

  open(x: Explanation, contentRect: Rect, composerRect: Rect): void {
    this.render(x);
    const p = computeCloudPlacement({ width: innerWidth, height: innerHeight }, contentRect, composerRect, { collapsedByDefault: this.collapsedByDefault });
    const s = this.host.style;
    s.width = `${p.width}px`;
    if (p.mode === 'margin') { s.left = `${p.left}px`; s.top = `${p.top}px`; s.right = ''; s.bottom = ''; }
    else { s.right = `${p.right}px`; s.bottom = `${p.bottom}px`; s.left = ''; s.top = ''; }
    this.host.toggleAttribute('collapsed', p.collapsed);
    this.host.dataset.mode = p.mode;
    this.host.hidden = false;
  }

  /** After the content grows (full model list), move the panel up so its bottom stays on screen. */
  private keepInView(): void {
    const r = this.host.getBoundingClientRect();
    const overflow = r.bottom - (innerHeight - 16);
    if (overflow <= 0) return;
    const s = this.host.style;
    if (this.host.dataset.mode === 'margin') s.top = `${Math.max(16, r.top - overflow)}px`;
  }

  close(): void {
    if (this.host.hidden) return;
    this.host.hidden = true;
    this.onCloseCb?.();
  }

  onFeedback(cb: (v: 'up' | 'down') => void): void { this.onVote = cb; }
  onClose(cb: () => void): void { this.onCloseCb = cb; }

  private render(x: Explanation): void {
    const box = this.box;
    box.replaceChildren();

    const head = el('div', 'head');
    head.append(el('h2', undefined, x.isCurrent ? 'Why this is a good pick' : 'Why this model'));
    const tools = el('div', 'tools');
    const collapse = el('button', undefined, '–');
    collapse.title = 'Collapse';
    collapse.addEventListener('click', () => this.host.toggleAttribute('collapsed'));
    const close = el('button', undefined, '×');
    close.title = 'Close';
    close.addEventListener('click', () => this.close());
    tools.append(collapse, close);
    head.append(tools);
    box.append(head);

    const chips = el('div', 'chips');
    chips.append(el('span', 'chip', x.taskLabel));
    chips.append(el('span', 'chip', `~${x.tokens.toLocaleString()} tokens in`));
    for (const s of x.signals) chips.append(el('span', 'chip', s));
    box.append(chips);

    if (x.sensitive.length) {
      box.append(el('div', 'warn', `Looks like it contains ${x.sensitive.map(s => s.replace(/_/g, ' ')).join(', ')}. Other services are not suggested unless you marked them trusted.`));
    }

    const table = el('table');
    const thead = el('thead');
    const hr = el('tr');
    const th = (text: string, cls?: string, title?: string) => { const h = el('th', cls, text); if (title) h.title = title; return h; };
    hr.append(th('Model'), th('Fit for this task', 'fit', 'How well the model suits this kind of prompt, 0 to 100%'), th('Est. cost', 'cost', 'Estimated cost of this one message at API prices, or included in your plan'));
    thead.append(hr);
    table.append(thead);
    const body = el('tbody');
    const addRow = (r: Explanation['rows'][number], extra = false) => {
      const tr = el('tr', [r.isWinner ? 'win' : '', extra ? 'extra' : ''].filter(Boolean).join(' ') || undefined);
      const name = el('td', 'name', r.label);
      if (r.isCurrent) name.append(el('em', undefined, ' · selected now'));
      name.append(el('small', undefined, r.serviceName));
      const fit = el('td', 'fit');
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = `${Math.round(r.fit * 100)}%`;
      bar.append(fill);
      fit.append(bar, el('span', 'pct', `${Math.round(r.fit * 100)}%`));
      fit.title = `Fit for this task: ${Math.round(r.fit * 100)}%`;
      const cost = el('td', 'cost', r.cost);
      if (r.apiCost) cost.append(el('small', undefined, r.apiCost));
      tr.append(name, fit, cost);
      body.append(tr);
    };
    for (const r of x.rows) addRow(r);
    for (const r of x.more) addRow(r, true);
    table.append(body);
    const list = el('div', 'list');
    list.append(table);
    box.append(list);
    if (x.more.length) {
      const toggle = el('button', 'more', `Show ${x.more.length} more model${x.more.length === 1 ? '' : 's'}`);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const open = table.classList.toggle('all');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Show fewer' : `Show ${x.more.length} more model${x.more.length === 1 ? '' : 's'}`;
        this.keepInView();
      });
      box.append(toggle);
    }

    box.append(el('p', 'why', x.why));

    if (x.elsewhere) {
      const e = x.elsewhere;
      box.append(el('p', 'else', `Elsewhere: ${e.label} on ${e.serviceName} (${e.cost}): ${e.why}.`));
    }

    const foot = el('div', 'foot');
    foot.append(el('span', undefined, 'Estimates; nothing you type leaves the browser.'));
    const votes = el('span', 'votes');
    const up = el('button', undefined, '👍');
    up.title = 'Good suggestion';
    const down = el('button', undefined, '👎');
    down.title = 'Bad suggestion';
    const vote = (v: 'up' | 'down', b: HTMLButtonElement) => {
      up.setAttribute('aria-pressed', String(b === up));
      down.setAttribute('aria-pressed', String(b === down));
      this.onVote?.(v);
    };
    up.addEventListener('click', () => vote('up', up));
    down.addEventListener('click', () => vote('down', down));
    votes.append(up, down);
    foot.append(votes);
    box.append(foot);
  }

  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.isOpen) this.close(); };
  private onOutside = (e: Event) => {
    if (!this.isOpen) return;
    const path = e.composedPath();
    if (path.includes(this.host)) return;
    if (path.some(n => n instanceof Element && n.tagName === 'EUBOULIA-BADGE')) return;
    this.close();
  };

  destroy(): void {
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('pointerdown', this.onOutside, true);
    this.host.remove();
  }
}
