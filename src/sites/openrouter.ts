import { makeAdapter, type AdapterDeps } from './adapter';

// Composer read from openrouter.ai/chat on 2026-10-12 (logged out).
export const openrouter = (deps: AdapterDeps) => makeAdapter({
  id: 'openrouter',
  hosts: ['openrouter.ai'],
  selectors: {
    composer: ['textarea[data-testid="composer-input"]', 'textarea[placeholder*="Ask anything" i]'],
    sendButton: ['form button[type="submit"]', 'button[aria-label*="Send" i]'],
    modelPicker: ['[data-testid="model-pill"]', 'button[aria-label^="Add Model"]'],
    pickerOpen: ['[role="dialog"] [role="option"]', '[role="listbox"] [role="option"]'],
    attachments: ['form img'],
    contentColumn: ['main', 'form'],
  },
}, deps);
