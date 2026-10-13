import { makeAdapter, type AdapterDeps } from './adapter';

// Not yet verified against a logged-in session. Compare mode shows several composers: one badge each.
export const poe = (deps: AdapterDeps) => makeAdapter({
  id: 'poe',
  hosts: ['poe.com'],
  selectors: {
    composer: ['textarea[class*="GrowingTextArea_textArea"]', 'textarea[placeholder*="Talk to" i]', 'form textarea'],
    sendButton: ['button[data-button-send="true"]', 'button[class*="sendButton" i]', 'button[aria-label*="Send" i]'],
    modelPicker: ['[class*="ChatPageMainFooter"] button[aria-haspopup]', '[class*="BotSelector"] button', 'a[class*="BotHeader"]'],
    pickerOpen: ['[role="menu"] [role="menuitem"]', '[role="listbox"] [role="option"]'],
    attachments: ['[class*="Attachment" i] img'],
    contentColumn: ['[class*="ChatPageMainFooter"]', 'main'],
  },
}, deps);
