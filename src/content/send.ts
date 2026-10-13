import type { ComposerHandle } from '../sites/adapter';

/** Call cb shortly after the user sends (send button click or Enter without Shift). */
export function detectSend(c: ComposerHandle, cb: () => void): () => void {
  const onClick = () => setTimeout(cb, 50);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) setTimeout(cb, 50);
  };
  c.sendButton?.addEventListener('click', onClick);
  c.element.addEventListener('keydown', onKey);
  return () => {
    c.sendButton?.removeEventListener('click', onClick);
    c.element.removeEventListener('keydown', onKey);
  };
}
