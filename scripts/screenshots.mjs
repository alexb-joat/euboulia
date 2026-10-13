// Store screenshots (1280x800) from the fixture page with the unpacked Chrome extension:
// the badge while typing a code prompt, and the explanation cloud open.
//   node scripts/build.mjs --target chrome --dev && node scripts/screenshots.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { start } from '../tests/e2e/server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'dist/chrome');
const out = path.join(root, 'store/screenshots');
await mkdir(out, { recursive: true });
const server = await start(8099);
const context = await chromium.launchPersistentContext('', { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
try {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8099/claude.html');
  // A narrower column than the fixture's default, so the explanation has room in the right margin at 1280 px.
  await page.addStyleTag({ content: 'main{max-width:640px !important;justify-content:flex-start !important;padding-top:48px !important} .conversation{flex:0 0 280px !important}' });
  await page.waitForTimeout(2500);   // let the fixture's re-render and route change pass first
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Grand Crawler: let\'s build the crawling scraping system that gathers the best available data from the net, analyses it, and suggests the best steps. Be smart, adaptive, novel. Also add a captcha solver.');
  await page.waitForFunction(() => (document.querySelector('euboulia-badge')?.shadowRoot?.textContent ?? '').match(/Suggest:|Good pick/));
  await page.screenshot({ path: path.join(out, '1-badge.png') });
  await page.evaluate(() => (document.querySelector('euboulia-badge').shadowRoot.querySelector('button')).click());
  await page.waitForFunction(() => { const c = document.querySelector('euboulia-cloud'); return !!c && !c.hidden; });   // margin or dock, whatever the width allows
  await page.evaluate(() => (document.querySelector('euboulia-cloud').shadowRoot.querySelector('button.more'))?.click());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, '2-cloud.png') });
  console.log(`wrote ${out}/1-badge.png and 2-cloud.png`);
} finally {
  await context.close();
  server.close();
}
