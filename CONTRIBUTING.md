# Contributing

Thanks for helping. Euboulia is small on purpose: no runtime dependencies, no remote code, nothing typed leaves the browser. Changes that keep it that way are welcome.

## Setup

```bash
npm ci
npm run typecheck && npm test
npm run test:e2e          # Chromium with the unpacked extension
npm run test:ff           # Firefox (needs geckodriver, see README)
```

## Fixing or adding a chat site

Most breakages are selector changes on the site, and most can be fixed with data alone.

1. Capture the page while signed in: `npm run fixture -- <service>` writes `tests/fixtures/sites/<service>.html` with conversation text, images and scripts stripped. **Read the file before committing it**: it must not contain your name, email or any conversation text. Add `--redact "Name,Other"` for anything the script missed.
2. Update the selectors for that service in `src/catalog/services.json` (data-testid and roles first, class names last) and set its `_verified` note to today's date. Mirror the change in the compiled fallback in `src/sites/<service>.ts`.
3. For a new site, add an adapter in `src/sites/` (usually a ten-line `makeAdapter` call), register it in `src/sites/registry.ts`, and add the service with its hosts, plans and models to `services.json`. The manifest's host permissions are generated from those hosts.
4. Add or update the test in `tests/dom/adapters.test.ts`, then `npm run catalog:build -- --from <saved OpenRouter models.json>` or plain `npm run catalog:build`.

## Rules

- Never add a network call to the content script or the options page; `tests/unit/no-network.test.ts` will fail.
- No `eval`, `innerHTML` or inline scripts.
- Keep commits small and describe the user-visible effect.
- Report security problems privately (see SECURITY.md), not in an issue.
