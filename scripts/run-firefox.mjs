// `npm run run:ff`: web-ext run with a persistent profile (log in to the chat sites once),
// and a workaround for snap-packaged Firefox (Ubuntu's default), which cannot read the
// temporary files web-ext writes to /tmp. Extra arguments go to web-ext, e.g.
//   npm run run:ff -- --start-url https://claude.ai/new
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = name => (process.env.PATH ?? '').split(path.delimiter).map(d => path.join(d, name)).find(p => existsSync(p));
const ff = which('firefox');
const isSnap = !!ff && (ff.startsWith('/snap/') || realpathSync(ff).endsWith('/snap'));

// A snap can only read non-hidden folders in $HOME and its own ~/snap/firefox area.
const base = isSnap ? path.join(os.homedir(), 'snap/firefox/common') : path.join(os.homedir(), '.cache/euboulia');
const profile = path.join(base, 'euboulia-dev-profile');
const tmp = path.join(base, 'web-ext-tmp');
mkdirSync(profile, { recursive: true });
mkdirSync(tmp, { recursive: true });

const bin = path.join(root, 'node_modules/.bin/web-ext');
const args = ['run', '--source-dir', path.join(root, 'dist/firefox'), '--firefox-profile', profile, '--profile-create-if-missing', '--keep-profile-changes', ...process.argv.slice(2)];
console.log(`Firefox${isSnap ? ' (snap)' : ''} with profile ${profile}`);
const child = spawn(bin, args, { stdio: 'inherit', env: { ...process.env, TMPDIR: tmp } });
child.on('exit', code => process.exit(code ?? 0));
