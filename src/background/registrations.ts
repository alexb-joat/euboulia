import { ext } from '../shared/browser';
import { getRegistrations, setRegistrations } from '../shared/storage';
import type { Registration } from '../shared/types';

const idFor = (pattern: string) => 'eu-' + btoa(unescape(encodeURIComponent(pattern))).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);

export async function registerSite(pattern: string, adapter: Registration['adapter']): Promise<void> {
  if (!/^https?:\/\/[^/]+\/\*$/.test(pattern)) throw new Error('pattern must look like https://host/*');
  const granted = await ext.permissions.contains({ origins: [pattern] });
  if (!granted) throw new Error('permission for that origin was not granted');
  const regs = (await getRegistrations()).filter(r => r.pattern !== pattern);
  regs.push({ pattern, adapter });
  await setRegistrations(regs);
  await syncRegistrations();
}

export async function unregisterSite(pattern: string): Promise<void> {
  await setRegistrations((await getRegistrations()).filter(r => r.pattern !== pattern));
  try { await ext.scripting.unregisterContentScripts({ ids: [idFor(pattern)] }); } catch { /* not registered */ }
}

/** Make the browser's registered scripts match storage (idempotent; run on startup). */
export async function syncRegistrations(): Promise<void> {
  const regs = await getRegistrations();
  const existing: { id: string }[] = await ext.scripting.getRegisteredContentScripts();
  const have = new Set(existing.map(s => s.id));
  for (const r of regs) {
    const id = idFor(r.pattern);
    const def = { id, matches: [r.pattern], js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true };
    try {
      if (have.has(id)) await ext.scripting.updateContentScripts([def]);
      else await ext.scripting.registerContentScripts([def]);
    } catch (e) { console.warn('[euboulia] register failed', r.pattern, e); }
  }
  const wanted = new Set(regs.map(r => idFor(r.pattern)));
  const stale = existing.filter(s => s.id.startsWith('eu-') && !wanted.has(s.id)).map(s => s.id);
  if (stale.length) await ext.scripting.unregisterContentScripts({ ids: stale });
}
