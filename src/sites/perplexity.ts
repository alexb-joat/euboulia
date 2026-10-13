import { makeAdapter, type AdapterDeps } from './adapter';

// Selectors read from perplexity.ai on 2026-10-12 (logged out).
export const perplexity = (deps: AdapterDeps) => makeAdapter({
  id: 'perplexity',
  hosts: ['perplexity.ai'],
  selectors: {
    composer: ['#ask-input', 'div[contenteditable="true"][data-lexical-editor="true"]'],
    sendButton: ['button[aria-label="Submit"]', 'button[aria-label*="Submit" i]'],
    modelPicker: ['button[aria-label="Model"]', 'button[aria-label*="Model" i][aria-haspopup="menu"]'],
    pickerOpen: ['[role="menu"] [role="menuitemradio"]', '[role="menu"] [role="menuitem"]', '[role="listbox"] [role="option"]'],
    attachments: ['[data-appearance="raised"] img'],
    contentColumn: ['main', '[data-appearance="raised"]'],
  },
}, deps);
