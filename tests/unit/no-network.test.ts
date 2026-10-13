// Guards the privacy promise: the bundles that run on chat pages (content) and in
// the options page must contain no network API at all; only the background script
// may fetch, and only the user-configured catalog URL. Bundled with esbuild in
// memory so the test does not depend on a prior build.
import { build } from 'esbuild';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const NETWORK = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\b|navigator\.connection|new\s+Image\(/;
const DYNAMIC = /\beval\s*\(|new\s+Function\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/;

async function bundle(entry: string): Promise<string> {
  const r = await build({
    entryPoints: [path.resolve(__dirname, '../../src', entry)], bundle: true, write: false, format: 'iife',
    platform: 'browser', minify: false, legalComments: 'none', logLevel: 'silent',
    define: { __DEV__: 'false', __TARGET__: '"chrome"' },
  });
  return r.outputFiles[0]!.text;
}

describe('no network from the page side', () => {
  it('content script has no network API and no dynamic code', async () => {
    const js = await bundle('content/main.ts');
    expect(js.length).toBeGreaterThan(10_000);
    expect(js.match(NETWORK)).toBeNull();
    expect(js.match(DYNAMIC)).toBeNull();
  });
  it('options page has no network API and no dynamic code', async () => {
    const js = await bundle('options/options.ts');
    expect(js.match(NETWORK)).toBeNull();
    expect(js.match(DYNAMIC)).toBeNull();
  });
  it('background fetches only in the catalog refresh module', async () => {
    const js = await bundle('background/main.ts');
    const hits = [...js.matchAll(/\bfetch\s*\(/g)].length;
    expect(hits).toBe(1);
    expect(js.match(DYNAMIC)).toBeNull();
  });
});
