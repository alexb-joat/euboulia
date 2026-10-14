# Where the catalog's facts come from

Euboulia never guesses a price, a context window, a model's status or an effort level. Every such figure in
`src/catalog/catalog.json` carries a `sources` entry with the URL it was read from and the date. The figures live in
`src/catalog/provider-facts.json`; `npm run catalog:build` merges that file over an OpenRouter seed (used only for
benchmark-derived strengths and for models the facts file does not cover).

## Provider documentation that is read

| Provider | Page | Gives | Machine-readable |
|---|---|---|---|
| Anthropic | platform.claude.com/docs/en/about-claude/models/overview | current models, API ids, context, max output, default effort, retirement commitments | yes, append `.md` |
| Anthropic | platform.claude.com/docs/en/about-claude/pricing | prices for current and legacy models, Haiku 5.5 tiers, cache rates | yes, `.md` |
| Anthropic | platform.claude.com/docs/en/build-with-claude/effort | effort values `low, medium, high, xhigh, max` and which models accept which | yes, `.md` |
| Anthropic | platform.claude.com/docs/en/about-claude/model-deprecations | active / legacy / deprecated / retired, retirement dates | yes, `.md` |
| Anthropic | platform.claude.com/docs/en/release-notes/overview | dated release notes (new models, price changes) | yes, `.md` |
| Anthropic | support.claude.com article 15424964 | which claude.ai plans include the Fable models | html |
| OpenAI | developers.openai.com/docs/models/{id} | per model: price, long-context surcharge, context, max output, `reasoning.effort` values | yes, `.md` |
| OpenAI | developers.openai.com/docs/pricing | the full price table | html |
| OpenAI | developers.openai.com/docs/deprecations | API deprecations with shutdown dates and replacements | html |
| OpenAI | developers.openai.com/changelog | dated API changelog (model releases, modes) | html |
| OpenAI | learn.chatgpt.com/docs/models | models and effort labels in ChatGPT Work and Codex, retirements from ChatGPT | yes, `.md` |
| OpenAI | openai.com/news/rss.xml | announcements | rss |

`help.openai.com` (the ChatGPT help centre, with the Chat picker and plan tables) blocks automated readers, so its
facts were read once by hand on 2026-10-14 and are marked as such in `services.json`. Nothing is taken from
third-party price trackers.

## What stays an estimate

How much each effort level changes output tokens and fit (`outputMultiplier`, `fitDelta` in `services.json`) is
Euboulia's own modelling; no provider publishes it. The picker labels of the chat apps (Light, Extra high, Instant)
are observed in the apps, not documented. Both are labelled as such in the files.

## The Ninshubur feed

The crawler project publishes `provider-facts.json` in exactly this format (`"$schema": "provider-facts.v1"`), read
from the pages above on a schedule, with every row quarantined if the page's structure changes. Euboulia's
`npm run catalog:build -- --facts <file>` consumes it, and the extension's daily catalog refresh downloads the
resulting `catalog.json` from the URL set on the options page.
