import { makeAdapter, type AdapterDeps } from './adapter';

export const gemini = (deps: AdapterDeps) => makeAdapter({
  id: 'gemini',
  hosts: ['gemini.google.com'],
  selectors: {
    composer: ['rich-textarea div[contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
    sendButton: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]', 'button.send-button'],
    modelPicker: ['button[data-test-id="bard-mode-menu-button"]', 'bard-mode-switcher button'],
    pickerOpen: ['[role="menu"] [role="menuitem"]'],
    attachments: ['uploader-file-preview', '.file-preview-container img'],
    contentColumn: ['.input-area-container', '[data-test-id="textarea-wrapper"]', 'main'],
  },
}, deps);
