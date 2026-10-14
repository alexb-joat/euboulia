// The redaction routine shared by the capture scripts. Runs inside the page: keeps structure, ids,
// classes, roles and short control labels; strips conversation text, image sources, scripts, styles,
// links and anything that looks like a secret or one of the given words.
export function redactPage({ sel, service, words }) {
  const SECRET = [/[\w.+-]+@[\w-]+\.[\w.-]+/g, /\b(sk|rk|pk|xoxb|ghp|gho|AIza)[-_][A-Za-z0-9_-]{16,}/g, /\b[A-Za-z0-9+/_-]{40,}\b/g, /\b(?:\d[ -]?){13,19}\b/g];
  const wordRes = words.map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
  const redact = s => [...SECRET, ...wordRes].reduce((t, re) => t.replace(re, '[redacted]'), s);
  const KEEP_ATTR = /^(id|class|role|type|name|placeholder|contenteditable|tabindex|disabled|aria-[\w-]+|data-(testid|test-id|state|placeholder|mobile-[\w-]+|composer-[\w-]+|button-[\w-]+|appearance|lexical-editor|slot|variant|size|radius)|for|lang|dir|hidden|rows|cols|value|checked|selected|title|alt|width|height|style)$/i;

  const composer = sel.composer.map(s => { try { return document.querySelector(s); } catch { return null; } }).find(Boolean);
  if (!composer) return null;
  const region = (sel.contentColumn ?? []).map(s => { try { return document.querySelector(s); } catch { return null; } }).find(Boolean)
    ?? composer.closest('main') ?? document.body;
  const container = composer.closest('form, fieldset') ?? composer.parentElement?.parentElement ?? composer;

  const clone = region.cloneNode(true);
  // Account areas carry names and emails: remove them outright rather than trusting text redaction alone.
  clone.querySelectorAll('[class*="avatar" i], [class*="mavatar" i], [aria-label*="account" i], [data-testid*="profile" i], [data-testid*="account" i], [data-testid*="user" i]').forEach(n => n.remove());
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
}
