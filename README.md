<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/banner-dark.svg">
  <img alt="Euboulia: good counsel for every prompt you type" src="docs/img/banner-light.svg" width="720">
</picture>

**A browser extension that suggests the best-value model for the prompt you are typing, on any LLM chat site.** A badge next to the composer names the model, shows the cost (or "included" in your plan) and answers "why?" in one click. Nothing you type leaves the browser.

[![ci](https://github.com/alexb-joat/euboulia/actions/workflows/ci.yml/badge.svg)](https://github.com/alexb-joat/euboulia/actions/workflows/ci.yml)
[![codeql](https://github.com/alexb-joat/euboulia/actions/workflows/codeql.yml/badge.svg)](https://github.com/alexb-joat/euboulia/actions/workflows/codeql.yml)
![typescript](https://img.shields.io/badge/TypeScript-Manifest%20V3-3178C6)
![browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Firefox-555)
![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-5fd6ae)
![network](https://img.shields.io/badge/outbound%20requests-catalog%20only-5fd6ae)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[Install](#install-unpacked-for-now) &nbsp;·&nbsp; [How it works](#how-it-works) &nbsp;·&nbsp; [Catalog](#catalog) &nbsp;·&nbsp; [Privacy](#security-and-privacy) &nbsp;·&nbsp; [Development](#development)

<sub><i>Euboulia (Εὐβουλία): good counsel, the virtue of deciding well before acting.<br>Here it decides which model deserves the prompt, and tells you why.</i></sub>

</div>

<br>

<table>
<tr>
<td width="50%"><img alt="The badge next to the composer, naming the suggested model and its cost." src="store/screenshots/1-badge.png"><br><sub><b>The badge.</b> Appears beside the composer in the site's own font and colours: model, cost or "included", and a "why?".</sub></td>
<td width="50%"><img alt="The explanation cloud in the page margin: task, signals, top three models with fit and cost." src="store/screenshots/2-cloud.png"><br><sub><b>The "why?" cloud.</b> Opens in the blank right margin, never over content: task, signals, the top three with fit and cost, and the reason the winner won.</sub></td>
</tr>
</table>

## Why Euboulia

| Private by design | Knows your plan | Explains itself | Learns locally |
|---|---|---|---|
| The classifier, the scoring and the catalog run inside the extension. The only network call is a daily download of the catalog JSON from the public [euboulia-catalog](https://github.com/alexb-joat/euboulia-catalog) repository; clear the URL on the options page to switch it off. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md). | Cost is shown both ways: "included" when the model is in the plan you set, otherwise the API-equivalent price for this prompt. When you open the site's model picker it notes which models the site really offers you. | Every suggestion carries the task it saw, the signals, the top three with fit and cost, every other available model one click away, and the sentence that explains the winner. | Thumbs up or down, and whether you followed the suggestion when you hit send, stay in the browser. Export or clear the history on the options page. |

## How it works

| Step | What happens |
|---|---|
| **Finds the chat UI** | Per-site adapters for Claude, ChatGPT and Gemini; experimental adapters for Grok, Perplexity, Le Chat, DeepSeek, Copilot, Poe and OpenRouter (selectors not yet verified on a signed-in session; a catalog update can fix them without a release); an Open WebUI adapter that recognises the app on any host; and a generic adapter for other self-hosted UIs. It finds every composer on the page (Poe's compare mode gets one badge per pane), the model currently selected, and attached images or files. |
| **Reads the prompt** | After 400 ms of idle, a keyword and regex classifier (the same signals as the [Trioditis](https://github.com/alexb-joat/trioditis) router) labels the task: code, reasoning, writing, quick chat, summarising, translation, data work, image understanding, long context. It notices sensitive data (emails, keys, card numbers) without ever storing the matched text. |
| **Scores the models** | Fit per task type comes from the catalog; cost is estimated from the prompt size and the model's API price, or shown as "included" for your plan. Models with an effort setting (Claude's Low to Max) are scored once per level, so the suggestion can be "Sonnet 5.5 · High". Your preference slider (best quality … cheapest) sets the balance, and a quality floor keeps a much weaker model from winning on price alone. Custom rules can prefer or exclude models. |
| **Shows the pick** | A badge styled from the site's own font and colours. If another service you enabled would be clearly better value, it says so. |
| **Learns** | When you keep overriding a suggestion with the same model for a task on a site (three or more times, most of the time), that model gets a small nudge and the explanation says "you usually pick X for this"; three net thumbs-downs nudge a model the other way. |

## Install (unpacked, for now)

```bash
npm install
npm run build          # dist/chrome and dist/firefox
```

- Chrome, Edge, Brave: open `chrome://extensions`, enable Developer mode, "Load unpacked", pick `dist/chrome`.
- Firefox: `npm run run:ff` (temporary add-on through web-ext, in a dev profile that keeps your logins between runs; works with Ubuntu's snap Firefox), or `about:debugging` → "Load Temporary Add-on" → `dist/firefox/manifest.json`. Firefox grants the chat sites at install; if you later switch a site off in the extensions menu, the options page shows an "Allow on these sites" banner to restore it.

The manifest's host permissions are generated from the hosts in `src/catalog/services.json`, so adding a site means adding it there (plus an adapter under `src/sites`).

Then open the extension's options page, set your plan on each service and move the slider.

## Catalog

`src/catalog/catalog.json` is the data contract: services (hosts, selectors, plans, picker labels) and models (strengths per task, prices, context, capabilities, sources with dates). Selectors live in the catalog on purpose: when a site redesigns its composer, a new catalog fixes it without an extension release.

- `npm run catalog:build` regenerates the bundled file from `src/catalog/services.json` plus the OpenRouter models API (prices, context, capabilities, benchmark indexes mapped to initial strengths); `--from models.json` uses a saved copy of that API response instead of fetching.
- Each service in `services.json` carries a `_verified` note saying which selectors were read from the live site and when. Sites behind a sign-in wall (Claude, DeepSeek, Copilot, Poe) still have best-guess selectors; the catalog can patch them later without a release.
- `npm run catalog:validate` runs the same validation the extension applies to a downloaded catalog.
- Prices, context, status and effort levels are read from the providers' documentation into `src/catalog/provider-facts.json`, every figure with its source; see [docs/catalog-sources.md](docs/catalog-sources.md). The Ninshubur crawler produces that file on a schedule; `npm run catalog:publish` pushes the built catalog to the public data repository the extension reads.

## Development

```bash
npm run typecheck
npm test                     # vitest: analyser, scoring, learning, catalog, DOM fixtures
npm run test:e2e             # Playwright + Chromium with the unpacked extension on fixture pages
npm run test:ff              # Firefox: temporary add-on through geckodriver on the same fixture page
npm run build:dev && npm run lint:ff
npm run watch                # rebuild on change
```

`test:ff` needs a Firefox binary and geckodriver. It picks Playwright's Firefox (`npx playwright install firefox`) or `firefox` on PATH, and `geckodriver` on PATH or `~/.cache/euboulia/geckodriver`; override with `FIREFOX_BIN` and `GECKODRIVER`. A snap-packaged geckodriver cannot see binaries outside its snap: use the upstream release.

Fixtures under `tests/fixtures/sites` are trimmed composer regions with a capture date and no personal data. To capture a fresh one from a logged-in session:

```bash
npm run fixture -- claude                     # opens Chromium with a profile under ~/.cache/euboulia; log in, the capture runs when the composer appears
npm run fixture -- chatgpt --cdp http://127.0.0.1:9222   # or attach to your own Chrome started with --remote-debugging-port=9222
```

The script keeps structure, ids, classes, roles and short control labels, and strips conversation text, image sources, scripts, styles, links and anything that looks like a secret.

## Layout

```
src/analyser    classify, sensitive, cost, score, decide, explain, learn  (pure, unit-tested)
src/catalog     catalog.json, schema validation, alias resolution
src/sites       adapter interface, one adapter per site, openwebui, generic
src/content     registry (SPA survival), watcher, badge, cloud, placement, theme
src/background  catalog refresh (alarms + ETag), self-hosted site registration
src/options     settings page
```

## Security and privacy

- No runtime dependencies, no remote code, no `eval`, no HTML injection; the bundles are unminified.
- `tests/unit/no-network.test.ts` fails if the content or options bundle gains any network API; the Chromium smoke asserts no request leaves the page.
- Dev dependencies pinned; GitHub Actions pinned by SHA with read-only permissions; CodeQL and dependency review on pull requests.
- Vulnerability reports: see [SECURITY.md](SECURITY.md).

## Status

Milestones 1 and 2 are done (ten sites plus Open WebUI and generic; badge; cloud; options; picker observation; Firefox and Chromium smokes) and the local-learning part of milestone 3. Still open: real-session selector checks on the sites behind sign-in walls, the optional click-through that switches the site's model for you, and pointing the catalog URL at the crawler's published file.

MIT licensed.
