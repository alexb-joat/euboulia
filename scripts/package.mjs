// Zip dist/chrome and build a Firefox artifact with web-ext.
//   node scripts/package.mjs          the store zips, from the current dist/
//   node scripts/package.mjs --team   also euboulia-chrome-<version>-team.zip: a Chrome build with "Choose for me"
//                                     on by default (to load unpacked), then dist/chrome is rebuilt as the store build.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await import('node:fs/promises').then(f => f.readFile(path.join(root, 'package.json'), 'utf8'))).version;
mkdirSync(path.join(root, 'web-ext-artifacts'), { recursive: true });
execFileSync('zip', ['-qr', path.join(root, 'web-ext-artifacts', `euboulia-chrome-${version}.zip`), '.'], { cwd: path.join(root, 'dist/chrome'), stdio: 'inherit' });
if (process.argv.includes('--team')) {
  const zip = path.join(root, 'web-ext-artifacts', `euboulia-chrome-${version}-team.zip`);
  rmSync(zip, { force: true });
  execFileSync('node', ['scripts/build.mjs', '--target', 'chrome', '--team'], { cwd: root, stdio: 'inherit' });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: path.join(root, 'dist/chrome'), stdio: 'inherit' });
  execFileSync('node', ['scripts/build.mjs', '--target', 'chrome'], { cwd: root, stdio: 'inherit' });   // dist/ is the store build again
  console.log(`team build: ${path.relative(root, zip)}`);
}
execFileSync('npx', ['web-ext', 'build', '--overwrite-dest', '--source-dir', 'dist/firefox', '--artifacts-dir', 'web-ext-artifacts'], { cwd: root, stdio: 'inherit' });
