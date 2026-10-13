import { makeAdapter, type AdapterDeps, type SiteAdapter } from './adapter';

/** Open WebUI (self-hosted): recognised by its fixed element ids, whatever the host. */
export function openwebui(deps: AdapterDeps): SiteAdapter {
  const a = makeAdapter({
    id: 'openwebui',
    hosts: [],
    selectors: {
      composer: ['#chat-input'],
      sendButton: ['#send-message-button', 'form button[type="submit"]'],
      modelPicker: ['#model-selector-0-button', 'button[aria-label="Select a model"]'],
      pickerOpen: ['[role="listbox"] [role="option"]', '[role="menu"] [role="menuitem"]'],
      attachments: ['[class*="file-item" i]', 'form img'],
      contentColumn: ['#chat-container', 'main', 'form'],
    },
  }, deps);
  return {
    ...a,
    detect: (doc, loc) =>
      a.detect(doc, loc) ||
      (!!doc.querySelector('#chat-input') && !!doc.querySelector('#send-message-button, #model-selector-0-button, button[aria-label="Select a model"]')) ||
      /open webui/i.test(doc.title),
  };
}
