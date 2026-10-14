// Serves tests/fixtures/pages on 127.0.0.1:8099 (no deps).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pages');
const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/sites');
export function start(port = 8099) {
  const server = createServer(async (req, res) => {
    const name = (req.url ?? '/').split('?')[0].replace(/^\//, '') || 'index.html';
    // /catalog.json serves the bundled catalog, for the options page's refresh path.
    if (name === 'catalog.json') {
      try {
        const body = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/catalog/catalog.json'));
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', etag: '"fixture-catalog"' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
      return;
    }
    // /real/<service>.html wraps a captured site fixture in a page that forces that service's adapter (dev builds only).
    const real = /^real\/([a-z]+)\.html$/.exec(name);
    if (real) {
      try {
        const body = await readFile(path.join(siteDir, `${real[1]}.html`), 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="euboulia-service" content="${real[1]}"><title>${real[1]} capture</title><style>body{margin:0;background:#fff;color:#111;font-family:sans-serif}</style></head><body>${body}</body></html>`);
      } catch { res.writeHead(404); res.end('not found'); }
      return;
    }
    try {
      const body = await readFile(path.join(dir, path.basename(name)));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) start().then(() => console.log('fixtures on http://127.0.0.1:8099/'));
