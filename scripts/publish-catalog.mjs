// Publish the built catalog and the provider facts to the public data repository that the extension's
// daily refresh reads (raw.githubusercontent.com serves it with an ETag). Data only: no code, no secrets.
//   npm run catalog:build && npm run catalog:publish            (uses ~/.cache/euboulia/catalog-repo)
//   CATALOG_REPO=git@github.com:alexb-joat/euboulia-catalog.git node scripts/publish-catalog.mjs [--dry-run]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.env.CATALOG_REPO ?? 'git@github.com:alexb-joat/euboulia-catalog.git';
const dir = process.env.CATALOG_DIR ?? path.join(os.homedir(), '.cache/euboulia/catalog-repo');
const dry = process.argv.includes('--dry-run');
const git = (...a) => { try { return execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim(); } catch (e) { if (a[0] === 'rev-parse') return ''; throw e; } };

if (!existsSync(path.join(dir, '.git'))) {
  mkdirSync(path.dirname(dir), { recursive: true });
  execFileSync('git', ['clone', '--quiet', repo, dir], { stdio: 'inherit' });
} else if (git('rev-parse', '--verify', '--quiet', 'HEAD') !== '') {
  git('pull', '--quiet', '--ff-only');
}
const catalog = JSON.parse(readFileSync(path.join(root, 'src/catalog/catalog.json'), 'utf8'));
if (catalog.schemaVersion !== 1 || !catalog.services || !catalog.models) throw new Error('catalog.json does not look valid; run npm run catalog:validate');
copyFileSync(path.join(root, 'src/catalog/catalog.json'), path.join(dir, 'catalog.json'));
copyFileSync(path.join(root, 'src/catalog/provider-facts.json'), path.join(dir, 'provider-facts.json'));
writeFileSync(path.join(dir, 'README.md'), `# Euboulia catalog

Data published for the [Euboulia](https://github.com/alexb-joat/euboulia) browser extension. No code runs from here.

- \`catalog.json\`: services, selectors, plans, models with prices, context, status and effort levels. Generated ${catalog.generatedAt}; provider facts dated ${catalog.factsGeneratedAt ?? catalog.generatedAt}.
- \`provider-facts.json\`: the figures read from the providers' own documentation, each with its source URL and date.

The extension downloads \`catalog.json\` from
\`https://raw.githubusercontent.com/alexb-joat/euboulia-catalog/main/catalog.json\` once a day, validates it, and keeps the previous copy if it fails.
`);
const status = git('status', '--porcelain');
if (!status) { console.log('catalog unchanged; nothing to publish'); process.exit(0); }
if (dry) { console.log('would publish:\n' + status); process.exit(0); }
git('add', '-A');
git('commit', '--quiet', '-m', `catalog ${catalog.generatedAt} (facts ${catalog.factsGeneratedAt ?? catalog.generatedAt})`);
git('push', '--quiet', '-u', 'origin', 'HEAD');
console.log(`published catalog ${catalog.generatedAt} to ${repo}`);
