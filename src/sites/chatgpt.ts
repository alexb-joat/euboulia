import { makeAdapter, type AdapterDeps } from './adapter';

export const chatgpt = (deps: AdapterDeps) => makeAdapter({
  id: 'chatgpt',
  hosts: ['chatgpt.com', 'chat.openai.com'],
  selectors: {
    composer: ['#prompt-textarea', 'textarea[name="prompt"]', 'div[contenteditable="true"].ProseMirror', 'form textarea'],
    sendButton: ['button[data-testid="send-button"]', 'button[data-composer-submit]', 'button[aria-label*="Send" i]'],
    modelPicker: ['button[data-testid="model-switcher-dropdown-button"]', 'button[aria-label*="Model selector" i]'],
    pickerOpen: ['div[role="menu"] [role="menuitem"]'],
    attachments: ['form [data-testid*="attachment"]', 'form img[alt*="Uploaded" i]'],
    contentColumn: ['form', 'main'],
  },
}, deps);
