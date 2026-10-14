import { BUNDLED } from '../catalog/index';
import { DEFAULT_CATALOG_URL } from '../shared/catalogUrl';
import { validateRule } from '../analyser/rules';
import { missingOrigins, requestMissing } from '../shared/access';
import { ext, isFirefox } from '../shared/browser';
import { send } from '../shared/messages';
import {
  clearUsage, getCatalogMeta, getPrefs, getRegistrations, getRules, getStoredCatalog, getUsage, onChanged, setPrefs, setRules,
} from '../shared/storage';
import type { Catalog, Prefs, Rule } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let prefs: Prefs;
let rules: Rule[];
let catalog: Catalog;

function hint(w: number): string {
  if (w <= 0.15) return 'Pick the strongest fit; cost barely matters.';
  if (w <= 0.45) return 'Balanced: a clearly better model is worth paying for.';
  if (w <= 0.75) return 'Lean cheap: only pay more when the fit gap is large.';
  return 'Cheapest model that can do the job.';
}

async function savePrefs(): Promise<void> { await setPrefs(prefs); }

function renderPreference(): void {
  const r = $<HTMLInputElement>('costWeight');
  r.value = String(prefs.costWeight);
  $('costWeightHint').textContent = hint(prefs.costWeight);
  $<HTMLInputElement>('crossService').checked = prefs.crossService;
  $<HTMLInputElement>('cloudCollapsed').checked = prefs.cloudCollapsedByDefault;
}

async function renderServices(): Promise<void> {
  const body = $('servicesTable').querySelector('tbody')!;
  body.replaceChildren();
  for (const [id, svc] of Object.entries(catalog.services)) {
    const sp = prefs.services[id] ?? { enabled: false };
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = svc.name;
    const en = document.createElement('td');
    const enBox = document.createElement('input');
    enBox.type = 'checkbox'; enBox.checked = sp.enabled;
    enBox.addEventListener('change', () => { prefs.services[id] = { ...sp, enabled: enBox.checked }; savePrefs(); });
    en.append(enBox);
    const plan = document.createElement('td');
    const sel = document.createElement('select');
    sel.append(new Option('pay per use / none', ''));
    for (const [pid, p] of Object.entries(svc.plans ?? {})) sel.append(new Option(`${p.name ?? pid}${p.price ? ` ($${p.price}/mo)` : ''}`, pid));
    sel.value = sp.plan ?? '';
    sel.addEventListener('change', () => { prefs.services[id] = { ...(prefs.services[id] ?? sp), plan: sel.value || undefined }; savePrefs(); });
    plan.append(sel);
    const tr2 = document.createElement('td');
    const trBox = document.createElement('input');
    trBox.type = 'checkbox'; trBox.checked = !!sp.trusted;
    trBox.addEventListener('change', () => { prefs.services[id] = { ...(prefs.services[id] ?? sp), trusted: trBox.checked }; savePrefs(); });
    tr2.append(trBox);
    const access = document.createElement('td');
    const origins = svc.hosts.map(h => `https://${h}/*`);
    const has = await ext.permissions.contains({ origins }).catch(() => true);
    if (has) access.textContent = 'granted';
    else {
      const b = document.createElement('button');
      b.textContent = isFirefox ? 'grant' : 'grant';
      b.addEventListener('click', async () => { if (await ext.permissions.request({ origins })) { renderServices(); renderAccess(); } });
      access.append(b);
    }
    tr.append(name, en, plan, tr2, access);
    body.append(tr);
  }
}

function renderRules(): void {
  const body = $('rulesTable').querySelector('tbody')!;
  body.replaceChildren();
  for (const r of rules) {
    const tr = document.createElement('tr');
    const id = document.createElement('td'); id.textContent = r.id;
    const when = document.createElement('td'); when.append(codeOf(JSON.stringify(r.when)));
    const then = document.createElement('td'); then.append(codeOf(JSON.stringify(r.then)));
    const del = document.createElement('td');
    const b = document.createElement('button'); b.textContent = 'remove';
    b.addEventListener('click', async () => { rules = rules.filter(x => x.id !== r.id); await setRules(rules); renderRules(); });
    del.append(b);
    tr.append(id, when, then, del);
    body.append(tr);
  }
  $<HTMLTextAreaElement>('rulesJson').value = JSON.stringify(rules.length ? rules : [
    { id: 'example', when: { task: 'chat' }, then: { prefer: 'anthropic/claude-haiku-5.5' } },
  ], null, 2);
}

function codeOf(text: string): HTMLElement { const c = document.createElement('code'); c.textContent = text; return c; }

async function renderCatalog(): Promise<void> {
  const meta = await getCatalogMeta();
  const dl = $('catalogInfo');
  const rows: [string, string][] = [
    ['Source', meta.source === 'remote' ? `remote (${meta.url})` : 'bundled with the extension'],
    ['Generated', catalog.generatedAt],
    ['Models', `${Object.keys(catalog.models).length} across ${Object.keys(catalog.services).length} services`],
  ];
  if (meta.fetchedAt) rows.push(['Last fetched', new Date(meta.fetchedAt).toLocaleString()]);
  if (meta.lastError) rows.push(['Last error', meta.lastError]);
  dl.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  $<HTMLInputElement>('catalogUrl').value = prefs.catalogUrl ?? DEFAULT_CATALOG_URL;
}

async function renderAccess(): Promise<void> {
  const missing = await missingOrigins(catalog, ext.permissions);
  $('accessBanner').hidden = missing.length === 0;
  $('grantAll').title = missing.map(o => o.replace(/^https:\/\/|\/\*$/g, '')).join(', ');
}

async function renderSites(): Promise<void> {
  const ul = $('siteList');
  ul.replaceChildren();
  for (const r of await getRegistrations()) {
    const li = document.createElement('li');
    li.textContent = `${r.pattern} (${r.adapter}) `;
    const b = document.createElement('button'); b.textContent = 'remove'; b.className = 'secondary';
    b.addEventListener('click', async () => { await send({ type: 'unregisterSite', pattern: r.pattern }); renderSites(); });
    li.append(b);
    ul.append(li);
  }
}

async function renderUsage(): Promise<void> {
  const u = await getUsage();
  const outcomes = u.filter(e => e.kind === 'outcome');
  const followed = outcomes.filter(e => e.followed).length;
  const votes = u.filter(e => e.kind === 'feedback');
  $('usageSummary').textContent = u.length
    ? `${u.length} events stored locally: ${outcomes.length} sends (${followed} followed the suggestion), ${votes.length} votes (${votes.filter(v => v.vote === 'up').length} up).`
    : 'No usage recorded yet. Events hold the site, task type and model ids only, never prompt text.';
}

function status(id: string, text: string, ok?: boolean): void {
  const el = $(id); el.textContent = text; el.className = ok === undefined ? 'muted' : ok ? 'ok' : 'err';
}

async function init(): Promise<void> {
  prefs = await getPrefs();
  rules = await getRules();
  catalog = (await getStoredCatalog()) ?? BUNDLED;
  renderPreference();
  await renderAccess();
  $('grantAll').addEventListener('click', async () => {
    await requestMissing(catalog, ext.permissions);
    await renderAccess(); await renderServices();
  });
  await renderServices();
  renderRules();
  await renderCatalog();
  await renderSites();
  await renderUsage();

  $<HTMLInputElement>('costWeight').addEventListener('input', e => {
    prefs.costWeight = parseFloat((e.target as HTMLInputElement).value);
    $('costWeightHint').textContent = hint(prefs.costWeight);
  });
  $<HTMLInputElement>('costWeight').addEventListener('change', savePrefs);
  $<HTMLInputElement>('crossService').addEventListener('change', e => { prefs.crossService = (e.target as HTMLInputElement).checked; savePrefs(); });
  $<HTMLInputElement>('cloudCollapsed').addEventListener('change', e => { prefs.cloudCollapsedByDefault = (e.target as HTMLInputElement).checked; savePrefs(); });

  $('saveRules').addEventListener('click', async () => {
    try {
      const parsed = JSON.parse($<HTMLTextAreaElement>('rulesJson').value);
      if (!Array.isArray(parsed)) throw new Error('expected a JSON list');
      const next = parsed.map(validateRule);
      const ids = new Set<string>();
      for (const r of next) { if (ids.has(r.id)) throw new Error(`duplicate rule id ${r.id}`); ids.add(r.id); }
      rules = next; await setRules(rules); renderRules(); status('rulesStatus', `${rules.length} rule(s) saved`, true);
    } catch (e) { status('rulesStatus', String((e as Error).message ?? e), false); }
  });

  $('refreshCatalog').addEventListener('click', async () => {
    const url = $<HTMLInputElement>('catalogUrl').value.trim();
    if (url) {
      try {
        const origin = new URL(url).origin + '/*';
        if (!(await ext.permissions.contains({ origins: [origin] }))) {
          if (!(await ext.permissions.request({ origins: [origin] }))) { status('catalogStatus', 'access to that origin was not granted', false); return; }
        }
      } catch { status('catalogStatus', 'not a valid URL', false); return; }
    }
    prefs.catalogUrl = url === DEFAULT_CATALOG_URL ? undefined : url; await savePrefs();   // '' means: never download
    status('catalogStatus', 'refreshing…');
    const r = await send({ type: 'refreshCatalog' });
    status('catalogStatus', r.ok ? String(r.message) : String(r.error), r.ok);
    catalog = (await getStoredCatalog()) ?? BUNDLED;
    await renderCatalog(); await renderServices();
  });
  $('resetCatalog').addEventListener('click', async () => {
    await send({ type: 'resetCatalog' });
    catalog = BUNDLED; status('catalogStatus', 'using the bundled catalog', true);
    await renderCatalog(); await renderServices();
  });

  $('addSite').addEventListener('click', async () => {
    const pattern = $<HTMLInputElement>('sitePattern').value.trim();
    const adapter = $<HTMLSelectElement>('siteAdapter').value as 'generic' | 'openwebui';
    if (!/^https?:\/\/[^/]+\/\*$/.test(pattern)) { status('siteStatus', 'use the form https://host/* or http://localhost:3000/*', false); return; }
    const granted = await ext.permissions.request({ origins: [pattern] }).catch(() => false);
    if (!granted) { status('siteStatus', 'access was not granted', false); return; }
    const r = await send({ type: 'registerSite', pattern, adapter });
    status('siteStatus', r.ok ? `added ${pattern}` : String(r.error), r.ok);
    $<HTMLInputElement>('sitePattern').value = '';
    await renderSites();
  });

  $('exportUsage').addEventListener('click', async () => {
    const blob = new Blob([JSON.stringify(await getUsage(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `euboulia-usage-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('clearUsage').addEventListener('click', async () => { await clearUsage(); await renderUsage(); });

  onChanged(keys => { if (keys.includes('usage')) renderUsage(); });
}

init().catch(e => console.error('[euboulia options]', e));
