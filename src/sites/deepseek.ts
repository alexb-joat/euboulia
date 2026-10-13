import { makeAdapter, type AdapterDeps } from './adapter';

// Not yet verified against a logged-in session: DeepSeek sits behind a sign-in wall.
export const deepseek = (deps: AdapterDeps) => makeAdapter({
  id: 'deepseek',
  hosts: ['chat.deepseek.com'],
  selectors: {
    composer: ['textarea#chat-input', 'textarea[placeholder*="DeepSeek" i]', 'div[contenteditable="true"][role="textbox"]'],
    sendButton: ['button[aria-label*="Send" i]', 'div[role="button"][aria-label*="send" i]'],
    modelPicker: ['[role="button"][aria-pressed="true"]', 'button[aria-pressed="true"]'],
    pickerOpen: [],
    attachments: ['[class*="file" i] img'],
    contentColumn: ['main', '#root'],
  },
}, deps);
