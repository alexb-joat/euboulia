// Firefox smoke: load dist/firefox as a temporary add-on through geckodriver
// (Playwright cannot load Firefox add-ons), type a code prompt on the fixture
// page and check the badge appears and survives the composer re-render.
//
//   npm run test:ff            (builds dist/firefox --dev first)
//   FIREFOX_BIN=/path/to/firefox GECKODRIVER=/path/to/geckodriver node tests/e2e/firefox.mjs
//
// Note: dev builds match http://127.0.0.1/* without a port on purpose; Firefox match patterns cannot carry one.
// Defaults: FIREFOX_BIN = Playwright's Firefox under ~/.cache/ms-playwright if present, else `firefox` on PATH;
// GECKODRIVER = `geckodriver` on PATH, else ~/.cache/euboulia/geckodriver. Snap-packaged geckodriver cannot
// see binaries outside its snap: use the upstream release (https://github.com/mozilla/geckodriver/releases).
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, By, Key, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { start } from './server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// A snap-packaged geckodriver (/snap/bin) cannot see binaries outside its snap, so it comes last.
const which = name => {
  const hits = (process.env.PATH ?? '').split(path.delimiter).map(d => path.join(d, name)).filter(p => existsSync(p));
  return hits.find(p => !p.startsWith('/snap/')) ?? hits[0];
};

function playwrightFirefox() {
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  if (!existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter(d => /^firefox-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) { const bin = path.join(base, d, 'firefox/firefox'); if (existsSync(bin)) return bin; }
  return undefined;
}

const bin = process.env.FIREFOX_BIN ?? playwrightFirefox() ?? which('firefox');
const cachedGd = path.join(os.homedir(), '.cache/euboulia/geckodriver');
const gd = process.env.GECKODRIVER ?? [which('geckodriver'), cachedGd].filter(p => p && existsSync(p)).sort((a, b) => a.startsWith('/snap/') - b.startsWith('/snap/'))[0] ?? cachedGd;
if (!bin) { console.error('no Firefox binary found; set FIREFOX_BIN'); process.exit(2); }
if (!existsSync(gd)) { console.error(`no geckodriver at ${gd}; set GECKODRIVER`); process.exit(2); }
console.log(`firefox: ${bin}\ngeckodriver: ${gd}`);

const server = await start(8099);
const opts = new firefox.Options().setBinary(bin).addArguments('-headless').windowSize({ width: 1600, height: 900 });
let driver;
try {
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(opts).setFirefoxService(new firefox.ServiceBuilder(gd).addArguments('--allow-system-access')).build();
} catch (e) {
  console.error(`could not start Firefox: ${e.message}`);
  if (process.env.SNAP) console.error('hint: this shell runs inside a snap (VS Code?); try: env -i HOME=$HOME PATH=/usr/local/bin:/usr/bin:/bin node tests/e2e/firefox.mjs');
  server.close();
  process.exit(2);
}

const badgeText = () => driver.executeScript('return document.querySelector("euboulia-badge")?.shadowRoot?.textContent ?? ""');
const waitFor = async (fn, what, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`timeout waiting for ${what}`);
};

let failed = false;
try {
  const id = await driver.installAddon(path.join(root, 'dist/firefox'), true);
  console.log(`installed ${id}`);

  // Site access. Firefox 127+ grants the manifest's host permissions at install, so the options page must stay
  // closed and its "Allow" banner hidden; once the user revokes a site (extensions menu), the banner must return.
  const optionsUrl = async () => {
    await driver.setContext(firefox.Context.CHROME);
    const u = await driver.executeScript('return WebExtensionPolicy.getByID(arguments[0]).getURL("options.html")', id);
    await driver.setContext(firefox.Context.CONTENT);
    return u;
  };
  const tabs = await driver.getAllWindowHandles();
  if (tabs.length !== 1) throw new Error(`install opened ${tabs.length - 1} extra tab(s) although access was granted`);
  await driver.get(await optionsUrl());
  const hiddenWhenGranted = await waitFor(() => driver.executeScript('const b = document.getElementById("accessBanner"); return b ? String(b.hidden) : null'), 'options page', 3000);
  if (hiddenWhenGranted !== 'true') throw new Error('access banner shown although every site is granted');
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(`
    const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
    const policy = WebExtensionPolicy.getByID(arguments[0]);
    return ExtensionPermissions.remove(arguments[0], { permissions: [], origins: ['https://claude.ai/*'] }, policy.extension);
  `, id);
  await driver.setContext(firefox.Context.CONTENT);
  await driver.navigate().refresh();
  const revoked = await waitFor(() => driver.executeScript('const b = document.getElementById("accessBanner"); return b && !b.hidden ? document.getElementById("grantAll").title : null'), 'banner after revoking a site', 3000);
  if (!revoked.includes('claude.ai')) throw new Error(`banner should name claude.ai, got: ${revoked}`);
  console.log(`site access: granted at install, banner hidden; after revoking claude.ai the banner lists: ${revoked}`);
  await driver.get('http://127.0.0.1:8099/claude.html');
  const composer = await driver.wait(until.elementLocated(By.css('.ProseMirror')), 5000);
  await composer.click();
  await composer.sendKeys('Why does this Python function raise KeyError? def f(d): return d["x"]');
  await waitFor(async () => /Suggest:|Good pick/.test(await badgeText()), 'badge after typing');
  const inBody = await driver.executeScript('return document.querySelector("euboulia-badge")?.parentElement === document.body');
  if (!inBody) throw new Error('badge host is not a child of body');
  console.log('badge:', (await badgeText()).trim());

  await driver.executeScript('document.querySelector("euboulia-badge").shadowRoot.querySelector("button").click()');
  const mode = await waitFor(() => driver.executeScript('return document.querySelector("euboulia-cloud")?.dataset.mode ?? ""'), 'cloud');
  console.log('cloud mode at 1600px:', mode);
  if (mode !== 'margin') throw new Error(`expected margin mode, got ${mode}`);
  await driver.actions().sendKeys(Key.ESCAPE).perform();

  await waitFor(() => driver.executeScript('return window.__routed === true'), 'route change', 6000);
  const again = await driver.findElement(By.css('.ProseMirror'));
  await again.click();
  await again.sendKeys('Translate this into French: good morning');
  await waitFor(async () => /Suggest:|Good pick/.test(await badgeText()), 'badge after re-render');
  const count = await driver.executeScript('return document.querySelectorAll("euboulia-badge").length');
  if (count !== 1) throw new Error(`expected 1 badge, found ${count}`);
  console.log('firefox smoke: ok');
} catch (e) {
  failed = true;
  console.error('firefox smoke failed:', e.message);
  try {   // diagnostics: did the content script run, and what did the browser console say?
    const dom = await driver.executeScript('return { badges: document.querySelectorAll("euboulia-badge").length, text: document.querySelector(".ProseMirror")?.textContent?.slice(0, 40), href: location.href }');
    console.error('page:', JSON.stringify(dom));
    await driver.setContext(firefox.Context.CHROME);
    const logs = await driver.executeScript(`
      return Services.console.getMessageArray().map(m => m.message ?? String(m)).filter(m => /euboulia|moz-extension|content.js/i.test(m)).slice(-15);
    `);
    console.error('console:', JSON.stringify(logs, null, 1));
    const info = await driver.executeScript(`
      const policy = WebExtensionPolicy.getByID('euboulia@alexbubnov.dev');
      if (!policy) return 'no policy for the add-on';
      const uri = Services.io.newURI('http://127.0.0.1:8099/claude.html');
      return 'canAccessURI=' + policy.canAccessURI(uri) + ' contentScripts=' + policy.contentScripts.length + ' matchesHost=' + policy.contentScripts.some(cs => cs.matchesURI(uri)) + ' active=' + policy.active;
    `);
    console.error('diagnostics:', info);
    await driver.setContext(firefox.Context.CONTENT);
  } catch (d) { console.error('diagnostics unavailable:', d.message); }
} finally {
  await driver.quit().catch(() => {});
  server.close();
}
process.exit(failed ? 1 : 0);
