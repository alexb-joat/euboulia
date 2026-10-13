// Capture a redacted DOM fixture of a live chat page's composer region into
// tests/fixtures/sites/<service>.html. Conversation text, image sources,
// scripts, styles, links and anything that looks like a secret are stripped;
// the structure, ids, classes, roles, test ids and short control labels stay.
//
//   node scripts/snapshot-fixture.mjs <service> [--url https://...] [--out file]
//        [--profile DIR]            launch Chromium (headed) with a persistent profile; log in once, the capture
//                                   runs as soon as the composer appears (default profile: ~/.cache/euboulia/profile)
//        [--cdp http://127.0.0.1:9222]  attach to a running Chrome started with --remote-debugging-port=9222 instead
//        [--wait SECONDS]           how long to wait for the composer (default 300)
//
// Only the composer region leaves the page, and only into the local file; nothing is uploaded anywhere.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const service = args.find(a => !a.startsWith('--'));
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
if (!service) { console.error('usage: node scripts/snapshot-fixture.mjs <service> [--url ...] [--cdp ...] [--profile DIR] [--out FILE]'); process.exit(2); }

const { services } = JSON.parse(await readFile(path.join(root, 'src/catalog/services.json'), 'utf8'));
const svc = services[service];
if (!svc) { console.error(`unknown service "${service}"; known: ${Object.keys(services).join(', ')}`); process.exit(2); }
const url = opt('--url', svc.url ?? `https://${svc.hosts[0]}/`);
const out = path.resolve(opt('--out', path.join(root, 'tests/fixtures/sites', `${service}.html`)));
const waitMs = Number(opt('--wait', '300')) * 1000;
const cdp = opt('--cdp', null);
const profile = opt('--profile', path.join(os.homedir(), '.cache/euboulia/profile'));

let browser, context, page;
if (cdp) {
  browser = await chromium.connectOverCDP(cdp);
  context = browser.contexts()[0] ?? await browser.newContext();
  page = context.pages().find(p => svc.hosts.some(h => { try { const u = new URL(p.url()); return u.hostname === h || u.hostname.endsWith('.' + h); } catch { return false; } }))
    ?? await context.newPage();
  if (!svc.hosts.some(h => page.url().includes(h))) await page.goto(url);
} else {
  await mkdir(profile, { recursive: true });
  context = await chromium.launchPersistentContext(profile, { headless: false, viewport: { width: 1600, height: 900 } });
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(url);
}

const composerSelectors = svc.selectors.composer;
console.log(`waiting up to ${waitMs / 1000}s for the composer on ${page.url()} (log in if asked)…`);
await page.waitForSelector(composerSelectors.join(', '), { state: 'visible', timeout: waitMs });
await page.waitForTimeout(1500);

const html = await page.evaluate(({ sel, service }) => {
  const SECRET = [/[\w.+-]+@[\w-]+\.[\w.-]+/g, /\b(sk|rk|pk|xoxb|ghp|gho|AIza)[-_][A-Za-z0-9_-]{16,}/g, /\b[A-Za-z0-9+/_-]{40,}\b/g, /\b(?:\d[ -]?){13,19}\b/g];
  const redact = s => SECRET.reduce((t, re) => t.replace(re, '[redacted]'), s);
  const KEEP_ATTR = /^(id|class|role|type|name|placeholder|contenteditable|tabindex|disabled|aria-[\w-]+|data-(testid|test-id|state|placeholder|mobile-[\w-]+|composer-[\w-]+|button-[\w-]+|appearance|lexical-editor|slot|variant|size|radius)|for|lang|dir|hidden|rows|cols|value|checked|selected|title|alt|width|height|style)$/i;

  const composer = sel.map(s => { try { return document.querySelector(s); } catch { return null; } }).find(Boolean);
  if (!composer) return null;
  const region = (sel.contentColumn ?? []).map(s => { try { return document.querySelector(s); } catch { return null; } }).find(Boolean)
    ?? composer.closest('main') ?? document.body;
  const container = composer.closest('form, fieldset') ?? composer.parentElement?.parentElement ?? composer;

  const clone = region.cloneNode(true);
  // Map original -> clone so we can tell which clone nodes belong to the composer's own container.
  const origs = [region, ...region.querySelectorAll('*')];
  const clones = [clone, ...clone.querySelectorAll('*')];
  const keepText = new Set();
  origs.forEach((o, i) => { if (container.contains(o) && o !== composer && !composer.contains(o)) keepText.add(clones[i]); });

  for (const el of clones) {
    if (/^(script|style|link|noscript|iframe|template|video|audio|canvas|object|embed)$/i.test(el.tagName)) { el.remove(); continue; }
    if (el.tagName.toLowerCase() === 'svg') { el.replaceChildren(); }
    for (const a of [...el.attributes]) {
      if (!KEEP_ATTR.test(a.name)) { el.removeAttribute(a.name); continue; }
      let v = redact(a.value);
      if (a.name === 'value') v = '';
      if (a.name === 'style') v = v.replace(/url\([^)]*\)/g, 'none');
      if (v.length > 300) v = v.slice(0, 300) + '…';
      el.setAttribute(a.name, v);
    }
    if (el.tagName === 'IMG') { el.setAttribute('src', 'data:,'); el.removeAttribute('srcset'); }
  }
  // Text: keep short control labels inside the composer container; drop conversation text elsewhere.
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    const parent = t.parentElement;
    const inComposer = parent && clones.includes(parent) && (parent === clones[origs.indexOf(composer)] || clones[origs.indexOf(composer)]?.contains(parent));
    if (inComposer) { t.textContent = ''; continue; }
    const s = t.textContent.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    if (parent && keepText.has(parent) && s.length <= 40) t.textContent = redact(s);
    else if (s.length <= 24 && /^[\w .,:+()/-]+$/.test(s)) t.textContent = redact(s);
    else t.textContent = '';
  }
  return `<!-- captured from ${location.hostname} on ${new Date().toISOString().slice(0, 10)} by scripts/snapshot-fixture.mjs (${service}); conversation text, image sources, scripts and styles stripped -->\n` + clone.outerHTML;
}, { sel: Object.assign([...composerSelectors], { contentColumn: svc.selectors.contentColumn }), service });

if (!html) { console.error('composer not found after waiting'); process.exit(1); }
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html + '\n');
console.log(`wrote ${path.relative(root, out)} (${html.length} chars)`);
if (cdp) await browser.close(); else await context.close();
