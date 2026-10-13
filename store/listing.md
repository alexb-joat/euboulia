# Store listing text

## Name
Euboulia

## Summary (132 characters max, Chrome)
Suggests the best-value model for the prompt you are typing, right inside Claude, ChatGPT, Gemini and more. Nothing you type leaves the browser.

## Description

Euboulia (Greek: good counsel) watches the prompt you are typing on a chat site and suggests the model that gives the best result for the least cost, before you press send.

- A small badge next to the prompt box: "Suggest: Haiku 5.5 · included (Pro) · why?"
- "why?" opens a compact explanation in the blank margin: the task it detected, the top three models with fit and cost, and the reason the winner won.
- Cost shown both ways: "included in your plan" and the equivalent API price, so you can see what a message really costs.
- A slider from "best quality" to "cheapest", plus your own rules ("prefer Haiku for quick chat").
- When another service you use would be clearly better value for this prompt, it says so.
- Learns your habits locally: "you usually pick X for this".

Everything runs inside the extension. The classifier, the scoring and the catalog live in your browser; the only network request is an optional daily catalog download from a URL you choose.

Supported sites: Claude, ChatGPT, Gemini. Experimental (selectors not yet verified on a signed-in session; they may need a catalog update): Grok, Perplexity, Le Chat, DeepSeek, Copilot, Poe, OpenRouter, and self-hosted UIs such as Open WebUI.

## Category
Productivity (Chrome) / Other, Privacy & Security (Firefox)

## Permission justifications (Chrome Web Store form)

- **storage**: settings, rules, the models seen in each site's picker, and a local history of suggestions and outcomes (no prompt text).
- **alarms**: a daily refresh of the model catalog from the URL the user configured.
- **scripting**: registers the content script on a self-hosted chat UI the user adds on the options page.
- **Host permissions** (claude.ai, chatgpt.com, chat.openai.com, gemini.google.com, grok.com, perplexity.ai, chat.mistral.ai, chat.deepseek.com, copilot.microsoft.com, poe.com, openrouter.ai): the content script reads the prompt box and model picker on these chat sites to place the badge.
- **Optional host permission `https://*/*`, `http://localhost/*`, `http://127.0.0.1/*`**: requested only when the user adds a self-hosted chat UI, and only for that origin.
- **Remote code**: none. The downloaded catalog is JSON data, validated before use.
- **Single purpose**: suggesting a model for the prompt being typed on LLM chat sites.

## Privacy practices
- Does not collect user data. See PRIVACY.md.
- Data stored locally: settings, model ids and task labels of past suggestions. Never prompt text.

## Firefox (AMO) notes
- `data_collection_permissions: required: ["none"]` is declared in the manifest.
- Source is unminified; `npm ci && npm run build` reproduces `dist/firefox` from the repository.

## Screenshots
`store/screenshots/` is produced by `node scripts/screenshots.mjs` (1280x800): the badge while typing a code prompt and the explanation cloud in the margin. Taken on the fixture pages, so no account or conversation is shown.
