// @vitest-environment jsdom
// "Choose for me": driving claude.ai's model menu (a stand-in built from the 8 Nov capture) and holding a send
// until the picker reads the suggestion. Real time, no fake timers: the driver polls the page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUNDLED } from '../../src/catalog/index';
import { Cloud } from '../../src/content/cloud';
import { readTheme } from '../../src/content/theme';
import { ComposerWatcher, type Shared } from '../../src/content/watcher';
import { DEFAULT_PREFS, type Prefs } from '../../src/shared/types';
import { claude, switchClaude } from '../../src/sites/claude';
import { SwitchError } from '../../src/sites/drive';
import '../fixtures/pages/fake-claude-menu.js';

vi.mock('../../src/content/usage', () => ({ record: vi.fn() }));
import { record } from '../../src/content/usage';

interface FakeMenu { state: { model: string; effort: Record<string, string> }; label(): string; select(model: string, effort?: string): void }
declare global { interface Window { installFakeClaudeMenu(b: HTMLElement, o?: { broken?: boolean }): FakeMenu } }

const PROMPT = 'Translate into French: good morning, see you tomorrow';
let sent: string[];
let menu: FakeMenu;
let watcher: ComposerWatcher | undefined;

function page(opts: { broken?: boolean } = {}): void {
  document.body.innerHTML = `<main><fieldset>
    <div contenteditable="true" data-testid="chat-input" class="ProseMirror"></div>
    <button type="button" data-testid="model-selector-dropdown"></button>
    <button type="button" aria-label="Send message">Send</button>
  </fieldset></main>`;
  menu = window.installFakeClaudeMenu(document.querySelector('[data-testid="model-selector-dropdown"]')!, opts);
  sent = [];
  const box = document.querySelector<HTMLElement>('[data-testid="chat-input"]')!;
  const send = () => { if (box.textContent) { sent.push(document.querySelector('[data-testid="model-selector-dropdown"]')!.getAttribute('aria-label')!); box.textContent = ''; } };
  document.querySelector('[aria-label="Send message"]')!.addEventListener('click', send);
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
}

function watch(prefs: Partial<Prefs> = {}): { w: ComposerWatcher; box: HTMLElement } {
  const p = { ...DEFAULT_PREFS, autoSwitch: true, services: { claude: { enabled: true, plan: 'max' } }, ...prefs };
  const adapter = claude({ catalog: BUNDLED, isVisible: () => true });
  const shared: Shared = { catalog: BUNDLED, prefs: p, rules: [], adapter, serviceId: 'claude', observed: {}, cloud: new Cloud(readTheme(document.body), false) };
  const c = adapter.composers()[0]!;
  c.element.textContent = PROMPT;
  watcher = new ComposerWatcher(c, shared);
  return { w: watcher, box: c.element };
}

const shadow = (sel: string) => document.querySelector('euboulia-badge')!.shadowRoot!.querySelector<HTMLElement>(sel);
const enter = (box: HTMLElement) => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const button = (text: string) => [...document.querySelector('euboulia-badge')!.shadowRoot!.querySelectorAll('button')].find(b => b.textContent === text);

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
  (globalThis as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  vi.mocked(record).mockClear();
});
afterEach(() => { watcher?.destroy(); watcher = undefined; });

describe('switchClaude on the captured menu structure', () => {
  beforeEach(() => page());
  const picker = () => document.querySelector<HTMLElement>('[data-testid="model-selector-dropdown"]')!;

  it('picks a model and its effort, and leaves no menu open', async () => {
    await switchClaude(picker(), { apiId: 'claude-sonnet-5-5', effortId: 'low' }, Date.now() + 1500);
    await vi.waitFor(() => expect(picker().getAttribute('aria-label')).toBe('Model: Sonnet 5.5 Low'));
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  it('finds an older model in the submenu', async () => {
    await switchClaude(picker(), { apiId: 'claude-sonnet-4-6', effortId: 'high' }, Date.now() + 1500);
    await vi.waitFor(() => expect(picker().getAttribute('aria-label')).toBe('Model: Sonnet 4.6 High'));
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  it('a model the menu does not list fails as not-offered and closes the menu', async () => {
    await expect(switchClaude(picker(), { apiId: 'claude-nope-9' }, Date.now() + 1500)).rejects.toMatchObject({ reason: 'not-offered' });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
    expect(picker().getAttribute('aria-label')).toBe('Model: Opus 5.5 Extra');
  });

  it('a menu that never opens times out', async () => {
    page({ broken: true });
    const err = await switchClaude(picker(), { apiId: 'claude-haiku-5-5' }, Date.now() + 200).catch(e => e);
    expect(err).toBeInstanceOf(SwitchError);
    expect(err.reason).toBe('timeout');
  });
});

describe('Choose for me on send', () => {
  it('names the model before Enter, switches, then sends exactly once with it', async () => {
    page();
    const { box } = watch();
    expect(shadow('.main')!.textContent).toMatch(/^Sending with: /);
    const target = shadow('.main b')!.textContent!;            // e.g. "Haiku 5.5 · Low"
    enter(box);
    enter(box);                                                  // an impatient second Enter must not send twice
    await vi.waitFor(() => expect(sent.length).toBe(1), { timeout: 3000 });
    await new Promise(r => setTimeout(r, 200));
    expect(sent).toEqual([`Model: ${target.replace(' · ', ' ')}`]);
    expect(shadow('.status')!.textContent).toContain(`Sent with ${target}`);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'outcome', autoSwitch: 'switched', followed: true }));
  });

  it('when the menu fails, sends unchanged once and says so', async () => {
    page({ broken: true });
    const { box } = watch();
    enter(box);
    await vi.waitFor(() => expect(sent.length).toBe(1), { timeout: 3000 });
    expect(sent).toEqual(['Model: Opus 5.5 Extra']);
    expect(shadow('.status')!.textContent).toMatch(/^Couldn't switch \(the menu took too long\), sent with Opus 5\.5 · Extra/);
    await vi.waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ autoSwitch: 'failed' })));
  });

  it("the person's own pick in the menu wins", async () => {
    page();
    const { w, box } = watch();
    menu.select('claude-opus-5-5', 'max');
    w.syncPicker();
    expect(shadow('.main')!.textContent).toMatch(/^Suggest: /);
    enter(box);
    expect(sent).toEqual(['Model: Opus 5.5 Max']);              // synchronous: nothing held
  });

  it('with the setting off, nothing changes and the send is not held', async () => {
    page();
    const { box } = watch({ autoSwitch: false });
    expect(shadow('.main')!.textContent).toMatch(/^Suggest: /);
    enter(box);
    expect(sent).toEqual(['Model: Opus 5.5 Extra']);
    await new Promise(r => setTimeout(r, 100));
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  it('Switch back restores the menu for the next message, which then goes unswitched; the chat can opt out', async () => {
    page();
    const { box } = watch();
    enter(box);
    await vi.waitFor(() => expect(button('Switch back')).toBeTruthy(), { timeout: 3000 });
    button('Switch back')!.click();
    await vi.waitFor(() => expect(menu.label()).toBe('Opus 5.5 Extra'), { timeout: 3000 });
    await vi.waitFor(() => expect(shadow('.status')!.textContent).toContain('Back on Opus 5.5 · Extra for your next message'));
    button("Don't switch in this chat")!.click();
    box.textContent = PROMPT;
    box.dispatchEvent(new Event('input'));
    enter(box);
    expect(sent.at(-1)).toBe('Model: Opus 5.5 Extra');
  });
});
