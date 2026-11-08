// Small helpers for driving a site's own menus the way a person would: pointer presses, waits and Escape.
// Used only by "Choose for me" (prefs.autoSwitch) to set the model picker before a send.

/** Why a switch did not happen; shown to the person as "Couldn't switch (…)". */
export class SwitchError extends Error {
  constructor(readonly reason: 'no-picker' | 'not-offered' | 'timeout' | 'mismatch', detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
  }
}

/** A full mouse press: menus built on Radix open on pointerdown, Base UI on click; sending both matches a real click. */
export function press(el: Element): void {
  const r = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  const pointer = { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const P = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new P('pointerdown', { ...pointer, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 }));
  el.dispatchEvent(new P('pointerup', pointer));
  el.dispatchEvent(new MouseEvent('mouseup', at));
  el.dispatchEvent(new MouseEvent('click', at));
}

/** The pointer moving onto an element: how submenus open for a person. A press on a submenu trigger can toggle it twice. */
export function hover(el: Element): void {
  const r = el.getBoundingClientRect();
  const at = { cancelable: true, composed: true, clientX: r.left + Math.min(10, r.width / 2), clientY: r.top + r.height / 2 };
  const P = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) {
    const Ctor = type.startsWith('pointer') ? P : MouseEvent;
    el.dispatchEvent(new Ctor(type, { ...at, bubbles: !type.endsWith('enter'), pointerId: 1, pointerType: 'mouse' } as PointerEventInit));
  }
}

/** One Escape keydown on the element (menus listen on themselves or the document, and it bubbles to both). */
export function escape(on: Element = document.activeElement ?? document.body): void {
  on.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true, composed: true }));
}

/** Poll until fn returns something truthy, or throw a timeout once the deadline (ms since epoch) passes. */
export async function waitFor<T>(fn: () => T | null | undefined | false, deadline: number, what: string): Promise<T> {
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new SwitchError('timeout', what);
    await new Promise(r => setTimeout(r, 25));
  }
}

export interface SwitchTarget {
  apiId: string;        // the provider's model id, which claude.ai puts on each menu item as data-model-id
  effortId?: string;    // the effort's API value (low … max), claude.ai's data-effort-id
}
