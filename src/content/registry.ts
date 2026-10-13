import type { ComposerHandle, SiteAdapter } from '../sites/adapter';

export const SCAN_COALESCE_MS = 250;

export interface RegistryHooks<T> {
  attach(c: ComposerHandle): T;
  detach(w: T): void;
  /** Called after every scan with the live composers (e.g. to peek at an open model picker). */
  scanned?(composers: ComposerHandle[]): void;
}

/** Keeps a watcher attached to every live composer across SPA re-renders and route changes. */
export class ComposerRegistry<T> {
  private watchers = new Map<Element, T>();
  private mo?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private lastHref = location.href;

  constructor(private adapter: SiteAdapter, private hooks: RegistryHooks<T>) {}

  start(): void {
    this.scan();
    this.mo = new MutationObserver(() => this.schedule());
    this.mo.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('pageshow', () => this.scan());
    addEventListener('popstate', () => this.scan());
  }

  stop(): void {
    this.mo?.disconnect();
    if (this.timer) clearTimeout(this.timer);
    for (const w of this.watchers.values()) this.hooks.detach(w);
    this.watchers.clear();
  }

  forEach(fn: (w: T) => void): void { for (const w of this.watchers.values()) fn(w); }
  get size(): number { return this.watchers.size; }

  private schedule(): void {
    if (this.timer || document.visibilityState === 'hidden') return;
    this.timer = setTimeout(() => { this.timer = undefined; this.scan(); }, SCAN_COALESCE_MS);
  }

  scan(): void {
    if (location.href !== this.lastHref) this.lastHref = location.href;
    const live = new Set<Element>();
    const composers = this.adapter.composers();
    for (const c of composers) {
      live.add(c.element);
      if (!this.watchers.has(c.element)) this.watchers.set(c.element, this.hooks.attach(c));
    }
    for (const [el, w] of this.watchers) {
      if (!el.isConnected || !live.has(el)) { this.hooks.detach(w); this.watchers.delete(el); }
    }
    this.hooks.scanned?.(composers);
  }
}
