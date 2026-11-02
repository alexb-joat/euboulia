# Changelog

## Unreleased

- A model drops out of the suggestions on its shutdown date, even when the downloaded catalog was published before that date. Earliest dates such as "not before 2027-06-09" never remove a model.
- Bundled catalog dated 2026-10-30.
- The published catalog refreshes daily, so a retired model or a price change reaches the extension within a day without a new release.

## 0.1.0 (2026-10-14)

First release, on [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/euboulia/).

- Badge next to the prompt box on Claude, ChatGPT and Gemini; experimental on Grok, Perplexity, Le Chat, DeepSeek, Copilot, Poe and OpenRouter; Open WebUI on any host; generic adapter for other self-hosted UIs.
- Local classifier (code, reasoning, writing, quick chat, summarising, translation, data, images, long context) and sensitive-data detector; nothing typed leaves the browser.
- Scoring by fit and cost with a preference slider, custom rules and a quality floor, so a much weaker model never wins on price alone.
- "why?" cloud in the blank page margin: task, signals, fit percentage and cost for every model, the reason for the pick, and a better-value model on another service when there is one.
- Effort levels: a model with an effort setting (Claude's Low to Max) is scored once per level, since higher effort costs more output tokens and plan cap and fits hard tasks a little better. The suggestion names the level, and the picker's current level is read from the model button.
- Every model a site offers is listed, including older ones (Claude's "More models").
- Cost shown as "included (plan)" with the API-equivalent price.
- Reads the open model picker to learn which models your plan offers; learns your habits locally.
- Prices, context windows, model status and effort levels come from the providers' own documentation, each figure with its source URL and date (`docs/catalog-sources.md`); long-context price tiers; retired models are never offered.
- Remote catalog URL with daily refresh and validation; bundled catalog dated 2026-10-14.
- Chrome and Firefox (142+) from one Manifest V3 codebase.

