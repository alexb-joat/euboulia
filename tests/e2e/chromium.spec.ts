import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { start } from './server.mjs';

const ext = path.resolve('dist/chrome');
let context: BrowserContext;
let server: { close(): void };

test.beforeAll(async () => {
  server = await start(8099) as { close(): void };
  context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
});
test.afterAll(async () => { await context?.close(); server?.close(); });

async function badgeText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => document.querySelector('euboulia-badge')?.shadowRoot?.textContent ?? '');
}

test('badge appears while typing, survives re-render and route change, cloud opens in the margin', async () => {
  const page = await context.newPage();
  // Privacy guard: every request from the page must go to the fixture server (the extension makes none).
  const foreign: string[] = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:8099/')) foreign.push(r.url()); });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://127.0.0.1:8099/claude.html');
  const composer = page.locator('.ProseMirror');
  await composer.click();
  await page.keyboard.type('Why does this Python function raise KeyError? def f(d): return d["x"]');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Suggest:|Good pick/);
  expect(await page.evaluate(() => document.querySelector('euboulia-badge')?.parentElement === document.body)).toBe(true);

  // Cloud in the right margin at 1600 px.
  await page.evaluate(() => (document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('button') as HTMLButtonElement).click());
  await expect.poll(() => page.evaluate(() => (document.querySelector('euboulia-cloud') as HTMLElement | null)?.dataset.mode ?? '')).toBe('margin');
  const cloudText = await page.evaluate(() => document.querySelector('euboulia-cloud')?.shadowRoot?.textContent ?? '');
  expect(cloudText).toContain('code');
  expect(cloudText).toContain('Fit for this task');   // the bars are labelled
  expect(cloudText).toMatch(/\d+%/);                  // and carry a number
  // The full model list is one click away and reveals the hidden rows.
  const hiddenBefore = await page.evaluate(() => [...document.querySelector('euboulia-cloud')!.shadowRoot!.querySelectorAll('tr.extra')].filter(r => getComputedStyle(r).display !== 'none').length);
  expect(hiddenBefore).toBe(0);
  await page.evaluate(() => (document.querySelector('euboulia-cloud')!.shadowRoot!.querySelector('button.more') as HTMLButtonElement | null)?.click());
  const shownAfter = await page.evaluate(() => [...document.querySelector('euboulia-cloud')!.shadowRoot!.querySelectorAll('tr.extra')].filter(r => getComputedStyle(r).display !== 'none').length);
  expect(shownAfter).toBeGreaterThan(0);
  await page.keyboard.press('Escape');

  // Re-render + route change: a badge must come back for the new composer.
  await page.waitForFunction(() => (window as any).__routed === true, null, { timeout: 5000 });
  const newComposer = page.locator('.ProseMirror');
  await newComposer.click();
  await page.keyboard.type('Translate this into French: good morning');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Suggest:|Good pick/);
  expect(await page.evaluate(() => document.querySelectorAll('euboulia-badge').length)).toBe(1);

  // Dock mode at a narrow viewport.
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.evaluate(() => (document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('button') as HTMLButtonElement).click());
  await expect.poll(() => page.evaluate(() => (document.querySelector('euboulia-cloud') as HTMLElement | null)?.dataset.mode ?? '')).toBe('dock');
  expect(foreign).toEqual([]);
  await page.close();
});

// The real captured pages (tests/fixtures/sites, from signed-in sessions) with the real extension loaded.
for (const [name, editor, expectModel] of [
  ['claude', '[data-testid="chat-input"]', /Suggest|Good pick/],
  ['gemini', '.ql-editor', /Suggest|Good pick/],
] as const) {
  test(`captured ${name} page: badge appears for a typed prompt and stays inside the page`, async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`http://127.0.0.1:8099/real/${name}.html`);
    await page.locator(editor).first().click();
    await page.keyboard.type('Why does this Python function raise KeyError? def f(d): return d["x"]');
    await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(expectModel);
    const box = await page.evaluate(() => {
      const r = (document.querySelector('euboulia-badge') as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
    });
    expect(box.w).toBeGreaterThan(40);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(box.vw);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await page.close();
  });
}

test('cloud follows window resizes: header visible, panel inside the window, only the list scrolls', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://127.0.0.1:8099/real/claude.html');
  await page.locator('[data-testid="chat-input"]').first().click();
  await page.keyboard.type("let's build the crawling scraping system with a database and an api, analyse the data and design the architecture");
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Suggest|Good pick/);
  await page.evaluate(() => (document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('button') as HTMLButtonElement).click());
  await page.evaluate(() => (document.querySelector('euboulia-cloud')!.shadowRoot!.querySelector('button.more') as HTMLButtonElement).click());
  const geometry = () => page.evaluate(() => {
    const host = document.querySelector('euboulia-cloud') as HTMLElement;
    const r = host.getBoundingClientRect();
    const head = host.shadowRoot!.querySelector('.head')!.getBoundingClientRect();
    const list = host.shadowRoot!.querySelector('.list') as HTMLElement;
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, headTop: head.top, vh: innerHeight, vw: innerWidth, mode: host.dataset.mode, listScrolls: list.scrollHeight > list.clientHeight };
  });
  for (const [w, h] of [[1600, 520], [1600, 900], [1700, 400], [1000, 700]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const g = await geometry();
    expect(g.top, `top at ${w}x${h}`).toBeGreaterThanOrEqual(0);
    expect(g.bottom, `bottom at ${w}x${h}`).toBeLessThanOrEqual(g.vh);
    expect(g.right, `right at ${w}x${h}`).toBeLessThanOrEqual(g.vw);
    expect(g.headTop, `header at ${w}x${h}`).toBeGreaterThanOrEqual(g.top);
    if (h <= 520) expect(g.listScrolls, `list scrolls at ${w}x${h}`).toBe(true);
    if (w === 1000) expect(g.mode).toBe('dock');
  }
  await page.close();
});

test('cloud with a plan: every model name on one line and every cost figure in full, in the margin and the dock', async () => {
  // Claude's Max plan, set the way a person would: the plan menu in the Claude row of the options page.
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const optionsUrl = `chrome-extension://${new URL(sw.url()).host}/options.html`;
  const setClaudePlan = async (plan: string) => {
    const options = await context.newPage();
    await options.goto(optionsUrl);
    await options.waitForSelector('html[data-ready]', { state: 'attached' });
    const row = options.locator('#servicesTable tbody tr').filter({ has: options.locator('td:first-child', { hasText: /^Claude$/ }) });
    await row.locator('select').selectOption(plan);
    await expect.poll(() => row.locator('select').inputValue()).toBe(plan);
    await options.waitForTimeout(200);   // the change handler stores the prefs asynchronously
    await options.close();
  };
  await setClaudePlan('max');

  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:8099/real/claude.html');
  await page.locator('[data-testid="chat-input"]').first().click();
  await page.keyboard.type('Why does this Python function raise KeyError? def f(d): return d["x"]');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Suggest|Good pick/);
  await page.evaluate(() => (document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('button') as HTMLButtonElement).click());
  await page.evaluate(() => (document.querySelector('euboulia-cloud')!.shadowRoot!.querySelector('button.more') as HTMLButtonElement).click());

  const measure = () => page.evaluate(() => {
    const host = document.querySelector('euboulia-cloud') as HTMLElement;
    const root = host.shadowRoot!;
    const list = root.querySelector('.list') as HTMLElement;
    const rows = [...root.querySelectorAll('tbody tr')].map(tr => {
      const name = tr.querySelector('td.name')!;
      const range = document.createRange();
      range.selectNodeContents(name.firstChild!);
      const tops = new Set([...range.getClientRects()].map(r => Math.round(r.top)));
      return {
        label: name.firstChild!.textContent!,
        lines: tops.size,
        service: name.querySelector('small')?.textContent ?? '',
        cost: tr.querySelector('td.cost')!.textContent ?? '',
        clipped: [...tr.querySelectorAll('td')].filter(td => td.scrollWidth > td.clientWidth).map(td => td.className),
      };
    });
    return { mode: host.dataset.mode, width: Math.round(host.getBoundingClientRect().width), listClipped: list.scrollWidth > list.clientWidth, rows };
  });

  // The captured Claude page leaves less than MIN_MARGIN beside the thread at 1440 px, so both sizes dock (as on 25 Nov).
  for (const [w, h] of [[1440, 900], [1000, 700]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const m = await measure();
    const at = `at ${w}x${h} (${m.mode}, cloud ${m.width} px)`;
    if (w === 1000) expect(m.mode, at).toBe('dock');
    expect(m.rows.filter(r => r.service === 'Claude').length, `Claude rows ${at}`).toBeGreaterThan(1);
    const wrapped = m.rows.filter(r => r.lines !== 1);
    expect(wrapped.map(r => `${r.label}: ${r.lines} lines`), `model labels on more than one line ${at}: ${wrapped.length} of ${m.rows.length}`).toEqual([]);
    expect(m.listClipped, `.list clipped ${at}`).toBe(false);
    expect(m.rows.filter(r => r.clipped.length).map(r => `${r.label}: ${r.clipped.join(', ')}`), `clipped cells ${at}`).toEqual([]);
    for (const r of m.rows.filter(r => r.service === 'Claude')) {
      expect(r.cost, `${r.label} weight ${at}`).toMatch(/[≈<][\d.]+×/);
      expect(r.cost, `${r.label} API figure ${at}`).toMatch(/API equivalent [~<]?\$[\d.]+/);
    }
  }
  await page.close();

  await setClaudePlan('');   // later tests expect a fresh install's defaults
});

test('badge steps aside while a site menu covers it, and comes back when the menu closes', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://127.0.0.1:8099/real/claude.html');
  await page.locator('[data-testid="chat-input"]').first().click();
  await page.keyboard.type('Why does this Python function raise KeyError? def f(d): return d["x"]');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Suggest|Good pick/);
  const visibility = () => page.evaluate(() => getComputedStyle(document.querySelector('euboulia-badge')!).visibility);
  expect(await visibility()).toBe('visible');
  // A model menu like ChatGPT's, opened right over the badge.
  await page.evaluate(() => {
    const r = document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('.pill')!.getBoundingClientRect();
    const m = document.createElement('div');
    m.id = 'fake-menu'; m.setAttribute('role', 'menu');
    Object.assign(m.style, { position: 'fixed', left: `${r.left - 40}px`, top: `${r.top - 60}px`, width: `${r.width + 80}px`, height: '200px', background: '#222', zIndex: '50' });
    document.body.append(m);
  });
  await expect.poll(visibility, { timeout: 2000 }).toBe('hidden');
  await page.evaluate(() => document.getElementById('fake-menu')!.remove());
  await expect.poll(visibility, { timeout: 2000 }).toBe('visible');
  await page.close();
});

test('options page: refresh downloads, validates and stores a catalog from the configured URL', async () => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.waitForSelector('html[data-ready]', { state: 'attached' });   // a click before init finishes does nothing
  await page.fill('#catalogUrl', 'http://127.0.0.1:8099/catalog.json');
  await page.click('#refreshCatalog');
  await expect.poll(() => page.textContent('#catalogStatus'), { timeout: 5000 }).toMatch(/catalog .* loaded/);
  await expect.poll(() => page.textContent('#catalogInfo'), { timeout: 2000 }).toContain('remote (http://127.0.0.1:8099/catalog.json)');
  // Back to the bundled copy: an empty URL switches downloads off.
  await page.fill('#catalogUrl', '');
  await page.click('#refreshCatalog');
  await expect.poll(() => page.textContent('#catalogStatus'), { timeout: 5000 }).toMatch(/switched off/);
  await page.close();
});

test('Choose for me: switches the menu before the send, sends once, and sends unchanged when the menu fails', async () => {
  // Turned on the way a person would: the checkbox on the options page.
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
  await options.waitForSelector('html[data-ready]', { state: 'attached' });
  await options.check('#autoSwitch');
  await options.close();

  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://127.0.0.1:8099/switch.html');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Translate into French: good morning, see you tomorrow');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Sending with: /);
  const target = await page.evaluate(() => document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('.main b')!.textContent!);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');   // impatient: must not send twice
  await expect.poll(() => page.evaluate(() => (window as any).__sent.length), { timeout: 3000 }).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__sent)).toEqual([`Model: ${target.replace(' · ', ' ')}`]);
  expect(await page.evaluate(() => document.querySelectorAll('[role="menu"]').length)).toBe(0);
  expect(await badgeText(page)).toContain(`Sent with ${target}`);

  // A menu that never opens: the message still goes, once, with the model shown, and the badge says so.
  await page.goto('http://127.0.0.1:8099/switch.html?broken');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Translate into French: good morning, see you tomorrow');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toMatch(/Sending with: /);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).__sent), { timeout: 3000 }).toEqual(['Model: Opus 5.5 Extra']);
  await expect.poll(() => badgeText(page), { timeout: 1000 }).toMatch(/Couldn't switch \(the menu took too long\), sent with Opus 5\.5 · Extra/);
  await page.close();

  const reset = await context.newPage();   // later tests expect the default
  await reset.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
  await reset.waitForSelector('html[data-ready]', { state: 'attached' });
  await reset.uncheck('#autoSwitch');
  await reset.close();
});
