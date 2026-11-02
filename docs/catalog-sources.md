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
| Google | ai.google.dev/gemini-api/docs/models | current Gemini API models | html |
| Google | ai.google.dev/gemini-api/docs/pricing | prices, promotional periods, 200k long-context tier | html |
| Google | docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/{id} | context, max output, thinking levels, release and retirement dates | html |
| Google | gemini.google/release-notes | which drop-down names the Gemini app uses and which plans get them | html |

Google's pages are HTML only and read by hand so far (Ninshubur's adapter does not parse them yet). `help.openai.com` (the ChatGPT help centre, with the Chat picker and plan tables) blocks automated readers, so its
facts were read once by hand on 2026-10-14 and are marked as such in `services.json`. Nothing is taken from
third-party price trackers.

## What stays an estimate

How much each effort level changes output tokens and fit (`outputMultiplier`, `fitDelta` in `services.json`) is
Euboulia's own modelling; no provider publishes it. The picker labels of the chat apps (Light, Extra high, Instant)
are observed in the apps, not documented. Both are labelled as such in the files.

## The Ninshubur feed

The Ninshubur crawler's `provider_docs` adapter reads the Markdown pages above on a schedule through its trust policy
(hard-coded pages only, declared fields, taint checks, quarantine on structure changes) and exports the same format:

```bash
ninshubur sources test provider-docs-anthropic     # admission checklist against the live page
ninshubur run --source provider-docs-anthropic --source provider-docs-openai
ninshubur export euboulia-facts -o docs-export.json
```

The export is an alarm, not an input. It has no Google figures and no release dates, and it lists models this catalog
leaves out on purpose (Mythos, long-retired Claude models), so building from it would lose facts and add models. The
daily refresh compares it with `provider-facts.json` and reports any difference in price, context, output limit, status,
shutdown date or effort levels; a person then checks the provider's page and edits the file. Checked on 2026-11-02: the
two files agree on those six fields for every model they share.

## The daily refresh

`deploy/linux/install.sh` installs a systemd user timer that runs `scripts/refresh-catalog.mjs` once a day from its own
clone at `origin/main`, so local edits and unpushed commits never reach the public catalog. It also means a pushed change
to `services.json` or `provider-facts.json` goes live with the next run. Each run builds, validates, compares with what is
published, and then does one of three things:

- **Publishes** ordinary news, with a desktop notification: a model retired on its shutdown date, a price or context
  change from OpenRouter, a new model.
- **Publishes nothing** when only dates changed, so a quiet day adds no commit to the public repository.
- **Holds** everything when a model or service vanished, a price moved by more than half (and more than 10 cents per
  million tokens) or went to zero, or strengths changed. One notification says why, and another only if more news piles
  up behind it. Nothing goes out until a person runs `npm run catalog:refresh -- --accept` in that clone
  (`~/.cache/euboulia/catalog-build`).

Strengths stay as published: the benchmark feed behind them changed scale in October 2026 and needs a person to re-map it.
A failed run tries again twice, 30 minutes apart, and then sends a notification. Every completed run adds one line to
`~/.local/state/euboulia/catalog-refresh.jsonl`, and `npm run catalog:refresh -- --dry-run` shows what a run would do.

The network calls are the OpenRouter models API, `github.com` to update the clone, and the push to the data repository.
