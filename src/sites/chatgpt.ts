import { makeAdapter, type AdapterDeps } from './adapter';

export const chatgpt = (deps: AdapterDeps) => makeAdapter({
  id: 'chatgpt',
  hosts: ['chatgpt.com', 'chat.openai.com'],
  selectors: {
    composer: ['#prompt-textarea', 'div[contenteditable="true"][data-composer-markdown]', 'textarea[name="prompt"]', 'div[contenteditable="true"].ProseMirror', 'form textarea'],
    sendButton: ['button[data-testid="send-button"]', 'button[data-composer-submit]', 'form button[type="submit"][aria-label="Send"]', 'button[aria-label*="Send" i]'],
    modelPicker: ['button[data-composer-navigation-target="reasoning"]', 'button[aria-label="Select ChatGPT model"]', 'button[data-testid="model-switcher-dropdown-button"]', 'button[aria-label*="Model selector" i]'],
    pickerOpen: ['div[role="menu"] [role="menuitemradio"]', 'div[role="menu"] [role="menuitem"]'],
    attachments: ['[data-composer-attachments] > *', 'form [data-testid*="attachment"]', 'form img[alt*="Uploaded" i]'],
    contentColumn: ['form', 'main'],
  },
}, deps);
