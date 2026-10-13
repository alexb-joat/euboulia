// One shim for both browsers: Firefox exposes `browser` (promise-based),
// Chrome exposes `chrome` (promise-based for the APIs we use since MV3).
declare const browser: typeof chrome | undefined;
declare const chrome: any;

export const ext: typeof chrome =
  typeof browser !== 'undefined' && browser ? browser : chrome;

export const isFirefox = typeof browser !== 'undefined' && !!browser;
