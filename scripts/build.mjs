// Build the extension for Chrome and/or Firefox: bundle with esbuild, merge
// manifests, copy static files. Usage:
//   node scripts/build.mjs --target chrome|firefox|all [--dev] [--watch]
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const dev = args.includes('--dev');
const watch = args.includes('--watch');
const targetArg = opt('--target', 'all');
const targets = targetArg === 'all' ? ['chrome', 'firefox'] : [targetArg];

// Port-less on purpose: Firefox match patterns cannot carry a port, and a port-less pattern matches any port in both browsers.
const DEV_MATCHES = ['http://127.0.0.1/*', 'http://localhost/*'];

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object'
      ? merge(out[k], v) : v;
  }
  return out;
}

/** Match patterns for every host in services.json, so the manifest and the catalog never drift apart. */
async function serviceMatches() {
  const { services } = JSON.parse(await readFile(path.join(root, 'src/catalog/services.json'), 'utf8'));
  const out = new Set();
  for (const svc of Object.values(services)) for (const h of svc.hosts ?? []) out.add(`https://${h}/*`);
  return [...out];
}

async function manifestFor(target) {
  const base = JSON.parse(await readFile(path.join(root, 'manifest/base.json'), 'utf8'));
  const over = JSON.parse(await readFile(path.join(root, `manifest/${target}.json`), 'utf8'));
  const m = merge(base, over);
  const matches = await serviceMatches();
  m.host_permissions = [...new Set([...(m.host_permissions ?? []), ...matches])];
  m.content_scripts[0].matches = [...new Set([...(m.content_scripts[0].matches ?? []), ...matches])];
  if (dev) {
    m.host_permissions = [...m.host_permissions, ...DEV_MATCHES];
    m.content_scripts[0].matches = [...m.content_scripts[0].matches, ...DEV_MATCHES];
  }
  return m;
}

async function buildTarget(target) {
  const out = path.join(root, 'dist', target);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const options = {
    entryPoints: {
      content: path.join(root, 'src/content/main.ts'),
      background: path.join(root, 'src/background/main.ts'),
      options: path.join(root, 'src/options/options.ts'),
    },
    outdir: out,
    bundle: true,
    format: 'iife',
    target: ['chrome120', 'firefox140'],
    sourcemap: dev ? 'inline' : false,
    minify: false,
    legalComments: 'none',
    define: { __DEV__: String(dev), __TARGET__: JSON.stringify(target) },
    logLevel: 'info',
  };
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(await manifestFor(target), null, 2));
  await cp(path.join(root, 'src/options/options.html'), path.join(out, 'options.html'));
  await cp(path.join(root, 'src/options/options.css'), path.join(out, 'options.css'));
  await cp(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`[${target}] watching`);
  } else {
    await build(options);
  }
}

for (const t of targets) await buildTarget(t);
