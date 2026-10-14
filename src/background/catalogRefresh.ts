import { validateCatalog } from '../catalog/schema';
import { getCatalogMeta, getPrefs, putCatalog, setCatalogMeta } from '../shared/storage';

// The published catalog (data only, public repository). Clear the URL on the options page to stay on the bundled copy.
export const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/alexb-joat/euboulia-catalog/main/catalog.json';

export async function refreshCatalog(): Promise<{ ok: boolean; message: string }> {
  const prefs = await getPrefs();
  const url = prefs.catalogUrl === '' ? '' : (prefs.catalogUrl ?? DEFAULT_CATALOG_URL);
  const meta = await getCatalogMeta();
  if (!url) return { ok: false, message: 'catalog download is switched off (empty URL); using the bundled catalog' };
  try {
    const headers: Record<string, string> = {};
    if (meta.etag && meta.url === url) headers['If-None-Match'] = meta.etag;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (res.status === 304) {
      await setCatalogMeta({ ...meta, fetchedAt: new Date().toISOString(), lastError: undefined });
      return { ok: true, message: 'catalog unchanged' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const catalog = validateCatalog(json);
    await putCatalog(catalog);
    await setCatalogMeta({ source: 'remote', url, etag: res.headers.get('etag') ?? undefined, fetchedAt: new Date().toISOString(), generatedAt: catalog.generatedAt });
    return { ok: true, message: `catalog ${catalog.generatedAt} loaded` };
  } catch (e) {
    await setCatalogMeta({ ...meta, lastError: `${new Date().toISOString()}: ${String((e as Error).message ?? e)}` });
    return { ok: false, message: String((e as Error).message ?? e) };
  }
}
