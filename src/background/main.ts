import { BUNDLED } from '../catalog/index';
import { missingOrigins } from '../shared/access';
import { ext } from '../shared/browser';
import { on } from '../shared/messages';
import { appendUsage, clearCatalog, getStoredCatalog } from '../shared/storage';
import { refreshCatalog } from './catalogRefresh';
import { registerSite, syncRegistrations, unregisterSite } from './registrations';

const ALARM = 'catalog-refresh';

function ensureAlarm(): void {
  ext.alarms.get(ALARM).then((a: unknown) => {
    if (!a) ext.alarms.create(ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 5 });
  });
}

ext.runtime.onInstalled.addListener(async (details: { reason?: string }) => {
  ensureAlarm();
  syncRegistrations().catch(() => {});
  // If site access is missing at install (a browser that does not grant host permissions up front), open the
  // options page, whose banner offers one "Allow" button. Chrome and Firefox 127+ grant them, so normally nothing opens.
  if (details?.reason === 'install') {
    const catalog = (await getStoredCatalog().catch(() => undefined)) ?? BUNDLED;
    if ((await missingOrigins(catalog, ext.permissions)).length) ext.runtime.openOptionsPage();
  }
});
ext.runtime.onStartup.addListener(() => { ensureAlarm(); syncRegistrations().catch(() => {}); });
ext.alarms.onAlarm.addListener((a: { name: string }) => { if (a.name === ALARM) refreshCatalog().catch(() => {}); });
ext.action?.onClicked?.addListener(() => ext.runtime.openOptionsPage());

on(async msg => {
  switch (msg.type) {
    case 'usage': await appendUsage(msg.event); return { ok: true };
    case 'refreshCatalog': { const r = await refreshCatalog(); return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message }; }
    case 'resetCatalog': await clearCatalog(); return { ok: true };
    case 'registerSite': await registerSite(msg.pattern, msg.adapter); return { ok: true };
    case 'unregisterSite': await unregisterSite(msg.pattern); return { ok: true };
  }
});
