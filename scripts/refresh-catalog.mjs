// The daily catalog refresh: build from this checkout, validate, compare with what is published, then publish or hold.
// Run by the timer from deploy/linux/install.sh, or by hand:
//   node scripts/refresh-catalog.mjs [--dry-run] [--accept] [--no-notify] [--from models.json] [--compare-facts docs.json]
// --dry-run reports and writes nothing. --accept publishes changes that were held. --compare-facts takes a crawl of the
// providers' docs (`ninshubur export euboulia-facts`) and reports where it disagrees with provider-facts.json; it never
// feeds the build, because that file also holds what the crawl cannot read (Google, release dates) and leaves out
// models the crawl lists on purpose.
// Strengths stay as published (--keep-strengths): the benchmark feed behind them changed scale in October 2026 and needs
// a person to re-map it. Every run appends one line to ~/.local/state/euboulia/catalog-refresh.jsonl.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCatalogs, factsDrift } from './catalog-diff.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run'), accept = args.includes('--accept'), quiet = args.includes('--no-notify');
const value = name => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const from = value('--from'), docsFile = value('--compare-facts');
const repoDir = process.env.CATALOG_DIR ?? path.join(os.homedir(), '.cache/euboulia/catalog-repo');
const stateDir = process.env.EUBOULIA_STATE ?? path.join(os.homedir(), '.local/state/euboulia');
const seenFile = path.join(stateDir, 'catalog-refresh-seen.json');

const run = (...a) => {
  try { execFileSync(process.execPath, a, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] }); }
  catch { console.error(`refresh stopped at ${a[0]}, see above; nothing was published by this run`); process.exit(1); }
};
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const list = lines => lines.slice(0, 6).join('\n') + (lines.length > 6 ? `\n... and ${lines.length - 6} more` : '');
const notify = (title, body) => {
  if (dry || quiet) return;
  // gdbus first: Ubuntu's AppArmor profile for notify-send refuses the bus from inside the timer's sandbox.
  // Without a desktop session both fail quietly, and the log still has it.
  const bus = spawnSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.Notifications', '--object-path', '/org/freedesktop/Notifications',
    '--method', 'org.freedesktop.Notifications.Notify', 'Euboulia', '0', "''", title, body, '[]', '{}', '-1'], { stdio: 'ignore' });
  if (bus.status !== 0) spawnSync('notify-send', ['--app-name=Euboulia', title, body], { stdio: 'ignore' });
};
const print = (title, lines) => { if (lines.length) console.log(`${title}:\n${lines.map(l => `  ${l}`).join('\n')}`); };

// The build reads the published catalog, not the bundled one, so it compares like with like.
run('scripts/publish-catalog.mjs', '--sync-only');
const publishedFile = path.join(repoDir, 'catalog.json');
const published = existsSync(publishedFile) ? readJson(publishedFile) : {};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'euboulia-catalog-'));
try {
  const nextFile = path.join(tmp, 'catalog.json');
  run('scripts/build-catalog.mjs', '--keep-strengths', '--previous', publishedFile, '--out', nextFile, ...(from ? ['--from', from] : []));
  run('scripts/validate-catalog.mjs', nextFile);

  const { changes, holds } = compareCatalogs(published, readJson(nextFile));
  const drift = docsFile && existsSync(docsFile)
    ? factsDrift(readJson(path.join(root, 'src/catalog/provider-facts.json')), readJson(docsFile)) : [];
  print('changes', changes); print('held for review', holds); print('docs disagree with provider-facts', drift);

  const pending = changes.length + holds.length > 0;
  const outcome = !pending ? 'unchanged' : holds.length && !accept ? 'held' : 'published';
  console.log(`${dry ? 'dry run, would be: ' : ''}${outcome}`);

  if (!dry) {
    mkdirSync(stateDir, { recursive: true });
    if (outcome === 'published') {
      run('scripts/publish-catalog.mjs', '--catalog', nextFile);
      notify('Euboulia catalog published', list([...holds, ...changes]));
    }
    // A held change stays held, so say it once, and again only when something new is waiting behind it.
    const waiting = outcome === 'held' ? [...holds, ...changes] : [];
    const seen = existsSync(seenFile) ? readJson(seenFile) : [];
    if (waiting.some(l => !seen.includes(l))) notify('Euboulia catalog held', `${list(holds)}\nTo publish anyway: cd ${root} && npm run catalog:refresh -- --accept`);
    if (drift.some(l => !seen.includes(l))) notify('Provider docs disagree with provider-facts', list(drift));
    writeFileSync(seenFile, JSON.stringify([...waiting, ...drift], null, 2));
    appendFileSync(path.join(stateDir, 'catalog-refresh.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), outcome, changes, holds, drift, docsCompared: Boolean(docsFile && existsSync(docsFile)) })}\n`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
