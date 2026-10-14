# Changelog

## 0.1.0 (unreleased)

First release.

- Badge next to the prompt box on Claude, ChatGPT and Gemini; experimental on Grok, Perplexity, Le Chat, DeepSeek, Copilot, Poe and OpenRouter; Open WebUI on any host; generic adapter for other self-hosted UIs.
- Local classifier (code, reasoning, writing, quick chat, summarising, translation, data, images, long context) and sensitive-data detector; nothing typed leaves the browser.
- Scoring by fit and cost with a preference slider, custom rules and a quality floor, so a much weaker model never wins on price alone.
- "why?" cloud in the blank page margin: task, signals, fit percentage and cost for every model, the reason for the pick, and a better-value model on another service when there is one.
- Effort levels: a model with an effort setting (Claude's Low to Max) is scored once per level, since higher effort costs more output tokens and plan cap and fits hard tasks a little better. The suggestion names the level, and the picker's current level is read from the model button.
- Every model a site offers is listed, including older ones (Claude's "More models").
- Cost shown as "included (plan)" with the API-equivalent price.
- Reads the open model picker to learn which models your plan offers; learns your habits locally.
- Remote catalog URL with daily refresh and validation; bundled catalog dated 2026-10-12.
- Chrome and Firefox (142+) from one Manifest V3 codebase.
