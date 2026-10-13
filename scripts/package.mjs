// Zip dist/chrome and build a Firefox artifact with web-ext.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await import('node:fs/promises').then(f => f.readFile(path.join(root, 'package.json'), 'utf8'))).version;
mkdirSync(path.join(root, 'web-ext-artifacts'), { recursive: true });
execFileSync('zip', ['-qr', path.join(root, 'web-ext-artifacts', `euboulia-chrome-${version}.zip`), '.'], { cwd: path.join(root, 'dist/chrome'), stdio: 'inherit' });
execFileSync('npx', ['web-ext', 'build', '--overwrite-dest', '--source-dir', 'dist/firefox', '--artifacts-dir', 'web-ext-artifacts'], { cwd: root, stdio: 'inherit' });
