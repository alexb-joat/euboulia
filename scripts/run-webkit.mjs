// `npm run run:webkit`: a Safari stand-in. Opens a chat site in Playwright's WebKit (the engine under Safari)
// with the built content script injected, so you can see how the badge and the "why?" cloud render and
// behave in Safari's engine, at MacBook Air size (1440x900) with a Mac Safari user agent.
//
// What it proves: the content script's DOM, CSS, shadow roots and site adapters work in WebKit.
// What it does NOT prove: Safari's extension packaging, permissions prompts, toolbar button, background
// worker, or the options page. Safari runs only on macOS; a real Safari build needs Xcode's converter.
//
// How: WebKit cannot load extensions, so the script wraps dist/chrome/content.js in a function whose
// `browser` parameter is a small stand-in: storage.local (in memory, starts empty, so the extension's
// defaults apply, as on a fresh install; --plan seeds what the options page saves when you pick a plan),
// storage.onChanged, and runtime.sendMessage, which answers { ok: true } and prints what was sent. Nothing is defined on the page's own window.
// The content script runs in the page's world here, not in an isolated world as in a real extension.
//
//   npm run run:webkit                          claude.ai in a window; log in once, the profile is kept
//   npm run run:webkit -- --url https://chatgpt.com/
//   npm run run:webkit -- --plan claude=max     costs as plan weight ("included · ≈N× Sonnet"); comma for more
//   npm run run:webkit -- --fixture claude      a captured page served at its real host, no network
//   npm run run:webkit -- --fixture demo        the styled Claude-like test page, served at claude.ai
//   npm run run:webkit -- --fixture claude --check
//
// --check runs headless: types a prompt, waits up to 15 s for the badge, opens the cloud and saves
// test-results/webkit-badge.png and test-results/webkit-cloud.png; exits 0 on success, 1 otherwise.
// Uses the build in dist/chrome as it is: run `npm run build` first. Profile: ~/.cache/euboulia/webkit-profile.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^\/\/ ?/gm, '');

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); process.exit(0); }
const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const known = new Set(['--url', '--fixture', '--plan', '--check']);
for (let i = 0; i < argv.length; i++) {
  if (!known.has(argv[i])) fail(`unknown argument "${argv[i]}". Run with --help for the options.`);
  if (argv[i] !== '--check') i++;
}

function fail(msg) { console.error(`run-webkit: ${msg}`); process.exit(1); }

// The VS Code snap's environment makes WebKit's network process load /snap/core20 libraries and crash
// ("WebKit encountered an internal error"). Re-run in a clean environment, keeping only what a window needs.
if (!process.env.EUBOULIA_WEBKIT_CLEAN) {
  const keep = ['HOME', 'LANG', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS'];
  const env = Object.fromEntries(keep.filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, {
    PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    LANG: process.env.LANG || 'C.UTF-8',
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: '1',   // the three missing libraries are copied in by hand
    EUBOULIA_WEBKIT_CLEAN: '1',
  });
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...argv], { stdio: 'inherit', env, cwd: root });
  child.on('exit', code => process.exit(code ?? 1));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
} else {
  await run();
}

async function run() {
  const check = argv.includes('--check');
  const fixture = flag('--fixture');
  const services = JSON.parse(readFileSync(path.join(root, 'src/catalog/services.json'), 'utf8')).services;
  // --plan claude=max,chatgpt=plus: the same prefs the options page saves when you only pick a plan.
  const seed = {};
  for (const pair of (flag('--plan') ?? '').split(',').filter(Boolean)) {
    const [id, plan] = pair.split('=');
    const plans = Object.keys(services[id]?.plans ?? {});
    if (!plans.includes(plan)) fail(`--plan ${pair}: ${services[id] ? `plans for ${id} are ${plans.join(', ')}` : `no service "${id}"; choose from ${Object.keys(services).join(', ')}`}.`);
    (seed.prefs ??= { services: {} }).services[id] = { enabled: false, plan };
  }
  let url = flag('--url') ?? 'https://claude.ai/new';
  const content = path.join(root, 'dist/chrome/content.js');
  if (!existsSync(content)) fail(`${content} is missing. Run \`npm run build\` first.`);

  // A fixture is served at its service's real host, so the production build picks the right adapter.
  let fixtureHtml;
  if (fixture) {
    const sites = path.join(root, 'tests/fixtures/sites');
    if (fixture === 'demo') {
      fixtureHtml = readFileSync(path.join(root, 'tests/fixtures/pages/claude.html'), 'utf8');
      url = 'https://claude.ai/new';
    } else {
      const captured = readdirSync(sites).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5));
      if (!captured.includes(fixture)) fail(`no capture named "${fixture}". Choose demo or one of: ${captured.join(', ')}.`);
      const host = services[fixture]?.hosts?.[0];
      if (!host) fail(`"${fixture}" is a self-hosted capture with no public host; use a site capture such as claude.`);
      const body = readFileSync(path.join(sites, `${fixture}.html`), 'utf8');
      fixtureHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${fixture} capture</title><style>body{margin:0;background:#fff;color:#111;font-family:-apple-system,sans-serif}</style></head><body>${body}</body></html>`;
      url = `https://${host}/`;
    }
  }

  const { webkit, devices } = await import('playwright');
  const profile = path.join(os.homedir(), '.cache/euboulia/webkit-profile');
  mkdirSync(profile, { recursive: true });
  const context = await webkit.launchPersistentContext(fixture ? '' : profile, {
    headless: check,
    viewport: { width: 1440, height: 900 },                   // MacBook Air
    userAgent: devices['Desktop Safari'].userAgent,           // imitation: Playwright's Mac Safari string
    bypassCSP: true,
  });
  context.on('close', () => process.exit(process.exitCode ?? 0));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => context.close());

  if (fixtureHtml) {
    const host = new URL(url).host;
    await context.route(`https://${host}/**`, route => route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml })
      : route.fulfill({ status: 404, body: '' }));
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).host === host ? route.fallback() : route.abort());
  }

  // The stand-in for the extension APIs, then the content script once the DOM is ready (manifest: document_idle).
  const script = readFileSync(content, 'utf8');
  await context.addInitScript({ content: `(() => {
    if (window.top !== window) return;   // the manifest injects into the top frame only
    const data = ${JSON.stringify(seed)}, changed = [];
    const copy = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    // get(null) returns everything; get('k') or get(['a', 'b']) the keys present; get({ k: fallback }) fills in fallbacks.
    const pick = keys => {
      if (keys == null) return copy(data);
      const fallbacks = typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
      const out = {};
      for (const k of Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys)) {
        if (k in data) out[k] = copy(data[k]); else if (k in fallbacks) out[k] = fallbacks[k];
      }
      return out;
    };
    const notify = changes => { if (Object.keys(changes).length) for (const cb of changed) try { cb(changes, 'local'); } catch (e) { console.warn('[euboulia stand-in]', e); } };
    const browser = {
      storage: {
        local: {
          get: async keys => pick(keys),
          set: async items => { const c = {}; for (const [k, v] of Object.entries(items)) { c[k] = { oldValue: data[k], newValue: copy(v) }; data[k] = copy(v); } notify(c); },
          remove: async keys => { const c = {}; for (const k of [].concat(keys)) if (k in data) { c[k] = { oldValue: data[k] }; delete data[k]; } notify(c); },
        },
        onChanged: { addListener: cb => changed.push(cb), removeListener: cb => changed.splice(changed.indexOf(cb) >>> 0, 1) },
      },
      runtime: {
        id: 'euboulia-webkit-stand-in',
        getURL: p => 'about:blank#' + p,
        sendMessage: async msg => { console.debug('[euboulia stand-in] to background: ' + JSON.stringify(msg)); return { ok: true }; },
        onMessage: { addListener() {}, removeListener() {} },
      },
    };
    const start = () => { (function (browser) {\n${script}\n})(browser); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  })();` });

  const page = context.pages()[0] ?? await context.newPage();
  page.on('console', m => { if (m.text().includes('[euboulia')) console.log(m.text()); });
  // On a fixture the site's own scripts are stripped, so any page error is ours; a live site makes plenty of its own.
  if (fixtureHtml) page.on('pageerror', e => console.log(`page error: ${e.message}`));
  console.log(`WebKit (Safari stand-in), 1440x900, ${fixtureHtml ? `fixture "${fixture}" at ${url}` : url}${fixtureHtml ? '' : `, profile ${profile}`}${seed.prefs ? `, plan ${flag('--plan')}` : ''}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  if (!check) { console.log('Close the window or press Ctrl+C to stop.'); return; }

  const out = path.join(root, 'test-results');
  mkdirSync(out, { recursive: true });
  try {
    const box = page.locator('[contenteditable="true"], textarea').first();
    await box.waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);   // let the content script attach to the composer
    await box.click();
    await page.keyboard.type('Write a Python function that parses a CSV of invoices, groups totals by customer, and add unit tests.');
    await page.waitForFunction(() => /Suggest:|Good pick/.test(document.querySelector('euboulia-badge')?.shadowRoot?.textContent ?? ''), null, { timeout: 15000 });
    const badge = await page.evaluate(() => document.querySelector('euboulia-badge').shadowRoot.textContent.replace(/\s+/g, ' ').trim());
    await page.screenshot({ path: path.join(out, 'webkit-badge.png') });
    await page.evaluate(() => document.querySelector('euboulia-badge').shadowRoot.querySelector('button').click());
    await page.waitForFunction(() => { const c = document.querySelector('euboulia-cloud'); return !!c && !c.hidden; }, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'webkit-cloud.png') });
    console.log(`badge: ${badge}`);
    console.log(`ok: saved ${path.join(out, 'webkit-badge.png')} and webkit-cloud.png`);
  } catch (e) {
    await page.screenshot({ path: path.join(out, 'webkit-failed.png') }).catch(() => {});
    console.error(`run-webkit: check failed: ${e.message.split('\n')[0]}. Screenshot: ${path.join(out, 'webkit-failed.png')}`);
    process.exitCode = 1;
  }
  await context.close();
}
