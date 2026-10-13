import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BUNDLED } from '../../src/catalog/index';
import type { AdapterDeps } from '../../src/sites/adapter';

export const deps: AdapterDeps = { catalog: BUNDLED, isVisible: () => true };

export function loadFixture(name: string, hostname: string): void {
  const html = readFileSync(path.join(__dirname, '../fixtures/sites', `${name}.html`), 'utf8');
  document.body.innerHTML = html;
  Object.defineProperty(window, 'location', { value: new URL(`https://${hostname}/`), writable: true, configurable: true });
}
