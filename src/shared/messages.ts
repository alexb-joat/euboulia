import { ext } from './browser';
import type { UsageEvent } from './types';

export type Message =
  | { type: 'usage'; event: UsageEvent }
  | { type: 'refreshCatalog' }
  | { type: 'resetCatalog' }
  | { type: 'registerSite'; pattern: string; adapter: 'generic' | 'openwebui' }
  | { type: 'unregisterSite'; pattern: string };

export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string };

export function send(msg: Message): Promise<Reply> {
  return ext.runtime.sendMessage(msg) as Promise<Reply>;
}

export function on(handler: (msg: Message) => Promise<Reply>): void {
  ext.runtime.onMessage.addListener((msg: Message, _sender: unknown, respond: (r: Reply) => void) => {
    handler(msg).then(respond, (e: unknown) => respond({ ok: false, error: String(e) }));
    return true;   // keep the channel open for the async reply
  });
}
