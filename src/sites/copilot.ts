import { makeAdapter, type AdapterDeps } from './adapter';

// Not yet verified against a logged-in session: Copilot sits behind a sign-in wall.
export const copilot = (deps: AdapterDeps) => makeAdapter({
  id: 'copilot',
  hosts: ['copilot.microsoft.com'],
  selectors: {
    composer: ['textarea#userInput', 'textarea[data-testid="composer-input"]', 'div[contenteditable="true"][role="textbox"]'],
    sendButton: ['button[data-testid="submit-button"]', 'button[aria-label*="Submit" i]', 'button[aria-label*="Send" i]'],
    modelPicker: ['button[data-testid="mode-switcher"]', 'button[aria-label*="mode" i][aria-haspopup]'],
    pickerOpen: ['[role="menu"] [role="menuitemradio"]', '[role="menu"] [role="menuitem"]', '[role="listbox"] [role="option"]'],
    attachments: ['[data-testid*="attachment" i]', '[data-testid="composer"] img'],
    contentColumn: ['[data-testid="composer"]', 'main'],
  },
}, deps);
