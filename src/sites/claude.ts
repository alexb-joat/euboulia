import { makeAdapter, type AdapterDeps } from './adapter';

export const claude = (deps: AdapterDeps) => makeAdapter({
  id: 'claude',
  hosts: ['claude.ai'],
  selectors: {
    composer: ['div[contenteditable="true"][data-testid="chat-input"]', 'div[contenteditable="true"].ProseMirror', 'fieldset div[contenteditable="true"]'],
    sendButton: ['button[data-testid="chat-input-send"]', 'button[aria-label="Send message"]', 'button[aria-label*="Send" i]'],
    modelPicker: ['button[data-testid="model-selector-dropdown"]', 'fieldset button[aria-haspopup="menu"]'],
    pickerOpen: ['div[role="menu"] [role="menuitem"]'],
    attachments: ['[data-testid="file-thumbnail"]', 'fieldset img'],
    contentColumn: ['fieldset', 'main'],
  },
}, deps);
