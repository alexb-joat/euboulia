import { makeAdapter, type AdapterDeps } from './adapter';

// Selectors read from grok.com on 2026-10-12 (logged out).
export const grok = (deps: AdapterDeps) => makeAdapter({
  id: 'grok',
  hosts: ['grok.com'],
  selectors: {
    composer: ['div[contenteditable="true"].ProseMirror[role="combobox"]', '[data-testid="chat-input"] div[contenteditable="true"]'],
    sendButton: ['button[data-testid="chat-submit"]', 'button[type="submit"][aria-label*="Submit" i]'],
    modelPicker: ['#model-select-trigger', 'button[aria-label^="Model:"]'],
    pickerOpen: ['[role="menu"] [role="menuitemradio"]', '[role="menu"] [role="menuitem"]'],
    attachments: ['[data-testid="chat-input"] img', '[data-testid*="attachment" i]'],
    contentColumn: ['[data-testid="chat-input"]', 'main'],
  },
}, deps);
