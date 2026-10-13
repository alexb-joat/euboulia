import { makeAdapter, type AdapterDeps } from './adapter';

// Composer and send button read from chat.mistral.ai on 2026-10-12 (logged out); the model menu is a guess.
export const mistral = (deps: AdapterDeps) => makeAdapter({
  id: 'mistral',
  hosts: ['chat.mistral.ai'],
  selectors: {
    composer: ['div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', 'form textarea'],
    sendButton: ['button[aria-label="Send"]', 'button[type="submit"][aria-label*="Send" i]'],
    modelPicker: ['button[aria-label*="model" i][aria-haspopup="menu"]', '[role="button"][aria-haspopup="menu"]'],
    pickerOpen: ['[role="menu"] [role="menuitemradio"]', '[role="menu"] [role="menuitem"]'],
    attachments: ['form img'],
    contentColumn: ['form', 'main'],
  },
}, deps);
