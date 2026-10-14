import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG_URL } from '../../src/background/catalogRefresh';

describe('default catalog URL', () => {
  it('points at the public data repository over https', () => {
    expect(DEFAULT_CATALOG_URL).toBe('https://raw.githubusercontent.com/alexb-joat/euboulia-catalog/main/catalog.json');
  });
});
