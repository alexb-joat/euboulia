// Capture a redacted DOM fixture of a live chat page's composer region into
// tests/fixtures/sites/<service>.html. Conversation text, image sources,
// scripts, styles, links and anything that looks like a secret are stripped;
// the structure, ids, classes, roles, test ids and short control labels stay.
//
//   node scripts/snapshot-fixture.mjs <service> [--url https://...] [--out file]
//        [--profile DIR]            launch Chromium (headed) with a persistent profile; log in once, the capture
//                                   runs as soon as the composer appears (default profile: ~/.cache/euboulia/profile)
//        [--cdp http://127.0.0.1:9222]  attach to a normal browser you started yourself, e.g.
//                                   chromium --remote-debugging-port=9222 --user-data-dir=$HOME/snap/chromium/common/euboulia-profile https://claude.ai/new
//        [--wait SECONDS]           how long to wait for the composer (default 300)
//        [--pause SECONDS]          keep waiting this long after the composer appears, e.g. to finish logging in (default 0)
//        [--redact "Name,Other"]    extra words to scrub; your OS user name and git user.name are always scrubbed
//   Account areas (avatars, "account" labels) are removed outright. ALWAYS read the written file before committing it.
//
// Only the composer region leaves the page, and only into the local file; nothing is uploaded anywhere.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { redactPage } from './lib/redact-page.mjs';

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
const pauseMs = Number(opt('--pause', '0')) * 1000;
const gitName = (() => { try { return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim(); } catch { return ''; } })();
const scrubWords = [...new Set([...(opt('--redact', '') ?? '').split(','), os.userInfo().username, ...gitName.split(/\s+/)].map(w => w.trim()).filter(w => w.length >= 3))];
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
  // Cloudflare-fronted sites (claude.ai) challenge browsers that announce automation: drop the flags that do.
  context = await chromium.launchPersistentContext(profile, {
    headless: false, viewport: { width: 1600, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'], args: ['--disable-blink-features=AutomationControlled'],
  });
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(url);
}

const composerSelectors = svc.selectors.composer;
console.log(`waiting up to ${waitMs / 1000}s for the composer on ${page.url()} (log in if asked)…`);
try {
  await page.waitForSelector(composerSelectors.join(', '), { state: 'visible', timeout: waitMs });
} catch (e) {
  console.error(/closed/i.test(String(e)) ? '\nThe browser window was closed before the composer appeared. Keep it open until this script prints "wrote …".' : `\nNo composer appeared within ${waitMs / 1000}s: ${String(e.message).split('\n')[0]}`);
  console.error('If a "Verify you are human" check keeps looping, use your own browser instead: see "--cdp" in the header of this script.');
  process.exit(1);
}
if (pauseMs) { console.log(`composer found; capturing in ${pauseMs / 1000}s (finish logging in now)…`); await page.waitForTimeout(pauseMs); }
await page.waitForTimeout(1500);

const html = await page.evaluate(redactPage, { sel: { composer: composerSelectors, contentColumn: svc.selectors.contentColumn ?? [] }, service, words: scrubWords });

if (!html) { console.error('composer not found after waiting'); process.exit(1); }
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html + '\n');
console.log(`wrote ${path.relative(root, out)} (${html.length} chars)`);
if (cdp) await browser.close(); else await context.close();
