import type { AdapterDeps, SiteAdapter } from './adapter';
import { chatgpt } from './chatgpt';
import { claude } from './claude';
import { copilot } from './copilot';
import { deepseek } from './deepseek';
import { gemini } from './gemini';
import { generic } from './generic';
import { grok } from './grok';
import { mistral } from './mistral';
import { openrouter } from './openrouter';
import { openwebui } from './openwebui';
import { perplexity } from './perplexity';
import { poe } from './poe';

/** Site adapters in detection order; the generic one is always last. */
export function allAdapters(deps: AdapterDeps): SiteAdapter[] {
  return [
    claude(deps), chatgpt(deps), gemini(deps),
    grok(deps), perplexity(deps), mistral(deps), deepseek(deps), copilot(deps), poe(deps), openrouter(deps),
    openwebui(deps), generic(deps),
  ];
}

export function pickAdapter(deps: AdapterDeps, doc: Document = document, loc: Location = location): SiteAdapter {
  const list = allAdapters(deps);
  return list.find(a => a.detect(doc, loc)) ?? list[list.length - 1]!;
}
