import type { ComposerHandle, SiteAdapter } from '../sites/adapter';

/** Decides, at the moment of a send, whether "Choose for me" holds it; hears about every send that reached the site. */
export interface SendGate {
  /** True holds this send: the event is stopped before the site sees it, and the gate calls `release()` once ready. */
  hold(): boolean;
  /** True while a held send waits for its release: any further send is swallowed, even with the site's menu open. */
  holding(): boolean;
  /** Called shortly after a send reached the site. */
  sent(): void;
}

export interface SendWatch {
  stop(): void;
  /** Send the held message once: a click on the site's send button (Enter on the composer when there is none). */
  release(): void;
}

// An open menu or list (a slash-command or mention list in the composer, the site's own menus): Enter picks from it
// instead of sending, so a send is never held then.
const POPUP = '[role="listbox"], [role="menu"]';

const isSendKey = (e: KeyboardEvent) =>
  e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing;

/**
 * Watch the composer's sends: Enter without modifiers in the composer, or a click on its send button. Listeners
 * sit on the window in the capture phase, so a held send is stopped before any of the site's own handlers run.
 */
export function watchSend(c: ComposerHandle, adapter: SiteAdapter, gate: SendGate): SendWatch {
  let replaying = false;
  const button = () => adapter.sendButton?.(c) ?? c.sendButton;
  const usable = (b: HTMLElement | null): b is HTMLElement =>
    !!b && b.isConnected && !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true';
  const after = () => setTimeout(() => gate.sent(), 50);

  const handle = (e: Event, holdable: boolean) => {
    if (replaying) { after(); return; }
    if (gate.holding()) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // an impatient second Enter
    if (holdable && gate.hold()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    after();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!isSendKey(e) || !(e.target instanceof Node) || !c.element.contains(e.target)) return;
    handle(e, usable(button()) && !document.querySelector(POPUP));
  };
  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target.closest('button') : null;
    if (!t || (t !== button() && t !== c.sendButton)) return;
    handle(e, usable(t));
  };
  addEventListener('keydown', onKey, true);
  addEventListener('click', onClick, true);

  return {
    stop() {
      removeEventListener('keydown', onKey, true);
      removeEventListener('click', onClick, true);
    },
    release() {
      replaying = true;
      try {
        const b = button();
        if (usable(b)) b.click();
        else c.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      } finally {
        replaying = false;
      }
    },
  };
}
