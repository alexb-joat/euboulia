// Chrome Web Store small promo tile (440x280) from store/promo/tile.html, plus a half-size preview for checking
// that it still reads where the store shrinks it.   node scripts/promo-tile.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
try {
  for (const [scale, name] of [[1, 'promo-440x280.png'], [0.5, 'promo-440x280-half.png']]) {
    const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(path.join(root, 'store/promo/tile.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(root, scale === 1 ? 'store' : 'test-results', name);
    await page.screenshot({ path: file });
    console.log(`wrote ${path.relative(root, file)}`);
  }
} finally {
  await browser.close();
}
