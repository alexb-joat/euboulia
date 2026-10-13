// CI gate: the bundled catalog must pass the same validation the extension runs.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? path.join(root, 'src/catalog/catalog.json');
const { outputFiles } = await build({
  entryPoints: [path.join(root, 'src/catalog/schema.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const c = mod.validateCatalog(JSON.parse(await readFile(file, 'utf8')));
console.log(`ok: ${Object.keys(c.services).length} services, ${Object.keys(c.models).length} models, generated ${c.generatedAt}`);
