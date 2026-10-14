# Privacy statement

Euboulia suggests which model to use for the prompt you are typing on an LLM chat site.

**What it reads.** The text in the chat site's prompt box while you type, the model currently selected in the site's picker, and whether an image or file is attached. It reads these from the page in your browser.

**What it stores, in your browser only.** Your settings (preference slider, plans, rules, trusted services), the models seen in each site's picker, and a history of up to 2000 events holding the site, the task type, the suggested model id, the selected model id and your thumbs up or down. No prompt text, no page content, no account information. You can export or clear the history on the options page.

**What leaves your browser.** Nothing you type, ever. The only network request the extension makes is a daily download of the model catalog (prices, context sizes, capabilities, with their sources) from the project's public data repository on GitHub, `raw.githubusercontent.com/alexb-joat/euboulia-catalog`. That request carries no identifier beyond what any download does. You can point it at your own URL, or clear the URL on the options page, after which the bundled catalog is used and the extension makes no network requests at all.

**What we collect.** Nothing. There is no telemetry, no analytics, no account, no server.

**Sensitive data.** When the prompt looks like it contains an email address, an API key, a card number or similar, the extension notes the kind of thing it saw (never the text) and keeps its suggestion on the service you are already using, unless you marked another service as trusted.

**Permissions.** Storage and alarms for the above; host permissions for the supported chat sites so the badge can appear there; the optional "all sites" permission is only requested when you add a self-hosted chat UI yourself, and only for that site.

Questions: open an issue on the repository.
