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
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toContain('Suggest:');
  expect(await page.evaluate(() => document.querySelector('euboulia-badge')?.parentElement === document.body)).toBe(true);

  // Cloud in the right margin at 1600 px.
  await page.evaluate(() => (document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('button') as HTMLButtonElement).click());
  await expect.poll(() => page.evaluate(() => (document.querySelector('euboulia-cloud') as HTMLElement | null)?.dataset.mode ?? '')).toBe('margin');
  const cloudText = await page.evaluate(() => document.querySelector('euboulia-cloud')?.shadowRoot?.textContent ?? '');
  expect(cloudText).toContain('code');
  await page.keyboard.press('Escape');

  // Re-render + route change: a badge must come back for the new composer.
  await page.waitForFunction(() => (window as any).__routed === true, null, { timeout: 5000 });
  const newComposer = page.locator('.ProseMirror');
  await newComposer.click();
  await page.keyboard.type('Translate this into French: good morning');
  await expect.poll(() => badgeText(page), { timeout: 3000 }).toContain('Suggest:');
  expect(await page.evaluate(() => document.querySelectorAll('euboulia-badge').length)).toBe(1);

  // Dock mode at a narrow viewport.
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.evaluate(() => (document.querySelector('euboulia-badge')!.shadowRoot!.querySelector('button') as HTMLButtonElement).click());
  await expect.poll(() => page.evaluate(() => (document.querySelector('euboulia-cloud') as HTMLElement | null)?.dataset.mode ?? '')).toBe('dock');
  expect(foreign).toEqual([]);
  await page.close();
});
