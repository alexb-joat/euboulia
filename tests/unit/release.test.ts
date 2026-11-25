// The version lives in four places; a release must carry one number in all of them,
// and the changelog's newest dated heading must be that number.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('manifest/base.json'));
const lock = JSON.parse(read('package-lock.json'));

describe('release versions', () => {
  it('package.json, manifest/base.json and both package-lock.json fields agree', () => {
    expect(manifest.version).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });
  it('the newest dated heading in CHANGELOG.md is that version', () => {
    const dated = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)$/gm)];
    expect(dated.length).toBeGreaterThan(0);
    const newest = dated.map((m) => m[1]!).sort((a, b) => cmp(b, a))[0];
    expect(newest).toBe(pkg.version);
  });
  it('the changelog lists dated releases from newest to oldest', () => {
    const dated = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)$/gm)];
    const dates = dated.map((m) => m[2]!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

function cmp(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}
