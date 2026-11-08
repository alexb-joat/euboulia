import { makeAdapter, type AdapterDeps } from './adapter';
import { SwitchError, escape, hover, press, waitFor, type SwitchTarget } from './drive';

export const claude = (deps: AdapterDeps) => makeAdapter({
  id: 'claude',
  hosts: ['claude.ai'],
  selectors: {
    composer: ['div[contenteditable="true"][data-testid="chat-input"]', 'div[contenteditable="true"].ProseMirror', 'fieldset div[contenteditable="true"]'],
    sendButton: ['button[data-testid="chat-input-send"]', 'button[aria-label="Send message"]', 'button[aria-label*="Send" i]'],
    modelPicker: ['button[data-testid="model-selector-dropdown"]', 'fieldset button[aria-haspopup="menu"]'],
    pickerOpen: ['div[role="menu"] [role="menuitemradio"]', 'div[role="menu"] [role="menuitem"]'],
    attachments: ['[data-testid="file-thumbnail"]', 'fieldset img'],
    contentColumn: ['fieldset', 'main'],
  },
  switcher: switchClaude,
}, deps);

// claude.ai's model menu (captured signed in, 8 Nov 2026): the picker button opens a role="menu" whose models are
// role="menuitemradio" items carrying data-model-id (the API id, e.g. claude-sonnet-5-5) and aria-checked. Two
// submenu triggers (aria-haspopup="menu") follow: one lists the efforts as menuitemradio items carrying
// data-effort-id (low, medium, high, xhigh, max), the other older models in the same form as the main list.
// Triggers are found by what their submenu holds, never by their text, so the page's language does not matter.

const OPEN_MENU = '[role="menu"]';
/** An item lookup by attribute value, compared as plain text (no selector escaping needed). */
type Want = () => HTMLElement | null;
const itemWith = (attr: string, value: string): Want => () =>
  [...document.querySelectorAll<HTMLElement>(`[role="menuitemradio"][${attr}]`)].find(el => el.getAttribute(attr) === value) ?? null;
const checked = (el: Element) => el.getAttribute('aria-checked') === 'true';

function menuFor(picker: HTMLElement): HTMLElement | null {
  if (picker.getAttribute('aria-expanded') !== 'true') return null;
  const menus = [...document.querySelectorAll<HTMLElement>(OPEN_MENU)];
  return menus.find(m => picker.id && m.getAttribute('aria-labelledby') === picker.id)
    ?? menus.find(m => m.querySelector('[data-model-id]')) ?? null;
}

async function openMenu(picker: HTMLElement, deadline: number): Promise<HTMLElement> {
  const open = menuFor(picker);
  if (open) return open;
  press(picker);
  return waitFor(() => menuFor(picker), deadline, 'model menu did not open');
}

/**
 * Open the menu's submenu triggers in turn until one shows an item matching `want`; returns that item. Older models
 * sit in the last submenu and efforts in the first, so `fromEnd` saves a wasted submenu on the common path.
 */
async function findInSubmenus(menu: HTMLElement, want: Want, deadline: number, fromEnd: boolean): Promise<HTMLElement | null> {
  const triggers = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"][aria-haspopup="menu"]')].filter(t => t.closest(OPEN_MENU) === menu);
  if (fromEnd) triggers.reverse();
  for (const trigger of triggers) {
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      // A plain click opens a submenu at once; hovering (with the site's delay) is the fallback.
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const opened = await waitFor(() => trigger.getAttribute('aria-expanded') === 'true', Math.min(deadline, Date.now() + 150), 'submenu').catch(() => false);
      if (!opened) hover(trigger);
    }
    const hit = await waitFor(want, Math.min(deadline, Date.now() + 400), 'submenu').catch(() => null);
    if (hit) return hit;
  }
  return null;
}

/** Close every menu the picker opened: Escape until the picker reports closed (each Escape closes one level). */
export async function closeMenus(picker: HTMLElement): Promise<void> {
  for (let i = 0; i < 4 && picker.getAttribute('aria-expanded') === 'true'; i++) {
    const menus = document.querySelectorAll(OPEN_MENU);
    escape(menus[menus.length - 1] ?? picker);
    await new Promise(r => setTimeout(r, 60));
  }
}

async function pick(picker: HTMLElement, want: Want, deadline: number, what: string, fromEnd: boolean): Promise<void> {
  const menu = await openMenu(picker, deadline);
  const item = want() ?? await findInSubmenus(menu, want, deadline, fromEnd);
  if (!item) { await closeMenus(picker); throw new SwitchError('not-offered', what); }
  if (!checked(item)) press(item);
  else await closeMenus(picker);   // already chosen
  await waitFor(() => picker.getAttribute('aria-expanded') !== 'true', deadline, 'menu did not close');
}

/** Set claude.ai's picker to the target model, then its effort. Throws SwitchError; leaves no menu open on success. */
export async function switchClaude(picker: HTMLElement, t: SwitchTarget, deadline: number): Promise<void> {
  try {
    await pick(picker, itemWith('data-model-id', t.apiId), deadline, t.apiId, true);
    if (t.effortId) await pick(picker, itemWith('data-effort-id', t.effortId), deadline, `effort ${t.effortId}`, false);
  } catch (e) {
    await closeMenus(picker);   // a timeout must not leave the page's menu hanging open
    throw e;
  }
}
