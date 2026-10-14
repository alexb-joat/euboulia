// Capture a redacted composer fixture from a signed-in Firefox profile (the one `npm run run:ff` keeps under
// ~/snap/firefox/common/euboulia-dev-profile). Firefox must not be running on that profile; the script works on
// a copy. Same redaction as snapshot-fixture.mjs. Optionally opens the model picker and lists its entries
// (labels only) to a .picker.txt next to the fixture.
//   node scripts/snapshot-fixture-firefox.mjs <service> [--url URL] [--picker] [--out FILE] [--wait SECONDS] [--region CSS]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { redactPage } from './lib/redact-page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const service = args.find(a => !a.startsWith('--'));
const opt = (n, f) => { const i = args.indexOf(n); return i === -1 ? f : args[i + 1]; };
const { services } = JSON.parse(readFileSync(path.join(root, 'src/catalog/services.json'), 'utf8'));
const svc = services[service];
if (!svc) { console.error(`unknown service ${service}`); process.exit(2); }
const url = opt('--url', svc.url ?? `https://${svc.hosts[0]}/`);
const out = path.resolve(opt('--out', path.join(root, 'tests/fixtures/sites', `${service}.html`)));
const waitMs = Number(opt('--wait', '60')) * 1000;
const base = path.join(os.homedir(), 'snap/firefox/common');
const src = process.env.FIREFOX_PROFILE ?? path.join(base, 'euboulia-dev-profile');
const copy = path.join(base, 'euboulia-capture-profile');
if (!existsSync(src)) { console.error(`no profile at ${src}; run npm run run:ff and log in first`); process.exit(2); }
rmSync(copy, { recursive: true, force: true });
cpSync(src, copy, { recursive: true });
for (const f of ['lock', '.parentlock']) rmSync(path.join(copy, f), { force: true });
const bin = process.env.FIREFOX_BIN ?? (existsSync('/snap/firefox/current/usr/lib/firefox/firefox') ? '/snap/firefox/current/usr/lib/firefox/firefox' : 'firefox');
const gd = process.env.GECKODRIVER ?? path.join(os.homedir(), '.cache/euboulia/geckodriver');
process.env.TMPDIR = path.join(base, 'web-ext-tmp'); mkdirSync(process.env.TMPDIR, { recursive: true });
const opts = new firefox.Options().setBinary(bin).addArguments('-headless').setProfile(copy).windowSize({ width: 1600, height: 900 });
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(opts).setFirefoxService(new firefox.ServiceBuilder(gd)).build();

const pageFn = `return (${redactPage.toString()})(arguments[0])`;
const words = [...new Set([os.userInfo().username, ...(opt('--redact', '') ?? '').split(',')].map(w => w.trim()).filter(w => w.length >= 3))];
try {
  await driver.get(url);
  const t0 = Date.now();
  let found = false;
  while (Date.now() - t0 < waitMs) {
    found = await driver.executeScript('return !!document.querySelector(arguments[0])', svc.selectors.composer.join(', '));
    if (found) break;
    await driver.sleep(1000);
  }
  if (!found) { console.error('composer not found; is the profile signed in?'); process.exit(1); }
  await driver.sleep(2000);
  const region = opt('--region', null);
  const html = await driver.executeScript(pageFn, { sel: { composer: svc.selectors.composer, contentColumn: region ? [region] : (svc.selectors.contentColumn ?? []) }, service, words });
  if (!html) { console.error('capture returned nothing'); process.exit(1); }
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html + '\n');
  console.log(`wrote ${path.relative(root, out)} (${html.length} chars)`);
  if (args.includes('--picker')) {
    const info = await driver.executeScript(`
      const pick = arguments[0].map(s => { try { return document.querySelector(s); } catch { return null; } }).find(Boolean);
      if (!pick) return { error: 'no picker button' };
      pick.click();
      return new Promise(r => setTimeout(() => {
        const items = [...document.querySelectorAll(arguments[1].join(', '))].map(e => ({ text: (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80), checked: e.getAttribute('aria-checked') || e.getAttribute('aria-selected') || '' }));
        r({ button: (pick.innerText || '').trim().slice(0, 60), label: pick.getAttribute('aria-label'), items });
      }, 1200));
    `, svc.selectors.modelPicker, svc.selectors.pickerOpen);
    const pfile = out.replace(/\.html$/, '.picker.txt');
    writeFileSync(pfile, JSON.stringify(info, null, 1) + '\n');
    console.log(`picker: button ${JSON.stringify(info.button)} (${info.label}); ${info.items?.length ?? 0} items -> ${path.relative(root, pfile)}`);
  }
} finally {
  await driver.quit().catch(() => {});
  rmSync(copy, { recursive: true, force: true });
}
