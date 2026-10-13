# Security

Euboulia is a browser extension that reads the prompt you are typing on a chat site and suggests a model. That makes two things non-negotiable: the prompt never leaves the page, and the extension never runs code it did not ship with.

## What the extension does and does not do

- **No prompt text leaves the browser.** The classifier, the sensitive-data detectors, the scoring and the explanation all run inside the content script. The detectors report names ("email", "api key"), never the matched text. The usage history stores site, task type and model ids only. A test (`tests/unit/no-network.test.ts`) fails the build if the content or options bundle contains any network API, and the Chromium smoke asserts that no request leaves the fixture page.
- **One network call, and only if you ask for it.** The background script downloads the catalog JSON from the URL you enter on the options page, daily, with an ETag. The bundled catalog is used otherwise. The downloaded file is validated before use and the previous copy is kept on failure.
- **No remote code.** No `eval`, no `Function`, no `innerHTML`, no inline scripts, no CDN. The bundles are unminified so a reviewer can read them. The catalog is data: it can carry CSS selectors, which are only ever passed to `querySelector` inside a `try` block.
- **Isolated UI.** The badge and the explanation live in Shadow DOM hosts appended to `document.body`, styled with constructed stylesheets, so the page's CSP and CSS cannot reach them and they cannot be mistaken for page content.
- **Permissions.** `storage` (settings and local history), `alarms` (the daily catalog refresh), `scripting` (to add a self-hosted chat UI you register on the options page). Host permissions are listed per supported chat site and generated from `src/catalog/services.json`. The broad `https://*/*` entry is *optional*: it is requested only when you add a self-hosted origin yourself, and only for that origin. Firefox declares `data_collection_permissions: none`.

## Supply chain

- Runtime dependencies: none. Everything under `node_modules` is build and test tooling.
- Dev dependencies are pinned to exact versions in `package.json` and locked in `package-lock.json`; Dependabot proposes updates weekly with a seven-day cooldown.
- GitHub Actions are pinned by commit SHA and run with `permissions: contents: read`. CodeQL and dependency review run on pull requests.
- `npm audit` findings in `web-ext`'s transitive dependencies (a Firefox packaging tool) are handled with `overrides` where a fixed version exists (`shell-quote`). Known exception as of 2026-10-13: `node-forge` (GHSA-86w9-cpqp-85rv) reached through `@devicefarmer/adbkit`, web-ext's Android support, which this project never invokes; no fixed release exists. None of that code ships in the extension, and CI audits the shipped tree (`npm audit --omit=dev`).

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting on this repository, or email beyondpeaksolstice@gmail.com. Give the browser, the extension version (options page) and steps to reproduce. You should hear back within a week. Please do not open a public issue for a security problem until a fix is available.

## Scope notes

- The extension reads the DOM of the chat sites it supports. It does not read cookies, local storage or network traffic of those sites.
- Suggestions are heuristics. A wrong suggestion is a bug, not a security issue, unless it is caused by a crafted catalog; catalog validation bugs are in scope.
