// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { pickAdapter } from '../../src/sites/registry';
import { resolveModelLabel } from '../../src/catalog/aliases';
import { BUNDLED } from '../../src/catalog/index';
import { deps, loadFixture } from './helpers';

describe('site adapters', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('claude: finds the composer, model, send button and column', () => {
    loadFixture('claude', 'claude.ai');
    const a = pickAdapter(deps);
    expect(a.id).toBe('claude');
    const [c] = a.composers();
    expect(c).toBeDefined();
    expect(c!.kind).toBe('contenteditable');
    expect(c!.element.getAttribute('data-testid')).toBe('chat-input');
    expect(c!.sendButton?.getAttribute('data-testid')).toBe('chat-input-send');
    expect(a.currentModel(c!)).toBe('Opus 5.5 Max');   // the real picker appends the effort level
    expect(resolveModelLabel(BUNDLED, 'claude', a.currentModel(c!))).toBe('anthropic/claude-opus-5.5');
    expect(a.contentColumn(c!).tagName).toBe('FIELDSET');
    expect(a.attachments(c!)).toEqual([]);
    c!.element.innerHTML = '<p>fix this bug</p>';
    expect(a.readText(c!)).toContain('fix this bug');
  });

  it('chatgpt: reads #prompt-textarea, header model button and an image attachment', () => {
    loadFixture('chatgpt', 'chatgpt.com');
    const a = pickAdapter(deps);
    expect(a.id).toBe('chatgpt');
    const [c] = a.composers();
    expect(c!.element.id).toBe('prompt-textarea');
    expect(c!.sendButton?.dataset.testid).toBe('send-button');
    expect(a.currentModel(c!)).toBe('ChatGPT 6.1 Sol');
    expect(resolveModelLabel(BUNDLED, 'chatgpt', a.currentModel(c!))).toBe('openai/gpt-6.1-sol');
    expect(a.attachments(c!).some(x => x.kind === 'image')).toBe(true);
  });

  it('gemini: rich-textarea composer and mode switcher', () => {
    loadFixture('gemini', 'gemini.google.com');
    const a = pickAdapter(deps);
    expect(a.id).toBe('gemini');
    const [c] = a.composers();
    expect(c!.element.classList.contains('ql-editor')).toBe(true);
    expect(a.currentModel(c!)).toBe('Flash');   // the real mode picker shows just the family name
    expect(resolveModelLabel(BUNDLED, 'gemini', a.currentModel(c!))).toBe('google/gemini-3.6-flash');
  });

  it('generic: two composers, per-pane model, read-only textarea ignored', () => {
    loadFixture('multi', 'arena.example');
    const a = pickAdapter(deps);
    expect(a.id).toBe('generic');
    const cs = a.composers();
    expect(cs.length).toBe(2);
    expect(a.currentModel(cs[0]!)).toContain('Claude Sonnet 5.5');
    expect(a.currentModel(cs[1]!)).toContain('GPT-6 Luna');
    (cs[0]!.element as HTMLTextAreaElement).value = 'hello';
    expect(a.readText(cs[0]!)).toBe('hello');
  });

  it('generic: self-hosted UI with an unknown local model', () => {
    loadFixture('librechat', 'localhost');
    const a = pickAdapter(deps);
    expect(a.id).toBe('generic');
    const cs = a.composers();
    expect(cs.length).toBe(1);
    expect(cs[0]!.sendButton?.getAttribute('aria-label')).toBe('Send message');
    expect(a.currentModel(cs[0]!)).toBeNull();
  });

  it('openwebui: recognised by its element ids on any host', () => {
    loadFixture('openwebui', 'localhost');
    const a = pickAdapter(deps);
    expect(a.id).toBe('openwebui');
    const [c] = a.composers();
    expect(c!.sendButton?.id).toBe('send-message-button');
    expect(a.currentModel(c!)).toBe('llama3.2:3b');
  });

  it('chatgpt: logged-out textarea composer with data-composer-submit button', () => {
    document.body.innerHTML = '<main><form data-logged-out=""><div data-composer-editor-host=""><textarea id="mobile-composer-prompt" name="prompt" placeholder="Ask ChatGPT"></textarea></div><button type="submit" aria-label="Send message" data-composer-submit=""></button></form></main>';
    Object.defineProperty(window, 'location', { value: new URL('https://chatgpt.com/'), writable: true, configurable: true });
    const a = pickAdapter(deps);
    const [c] = a.composers();
    expect(c!.kind).toBe('textarea');
    expect(c!.sendButton?.hasAttribute('data-composer-submit')).toBe(true);
    expect(a.currentModel(c!)).toBeNull();
  });

  it('grok: tiptap combobox composer, mode button resolves to a model', () => {
    loadFixture('grok', 'grok.com');
    const a = pickAdapter(deps);
    expect(a.id).toBe('grok');
    const [c] = a.composers();
    expect(c!.sendButton?.dataset.testid).toBe('chat-submit');
    expect(a.currentModel(c!)).toBe('Fast');
    expect(resolveModelLabel(BUNDLED, 'grok', a.currentModel(c!))).toBe('x-ai/grok-4.3');
    expect(a.contentColumn(c!).getAttribute('data-testid')).toBe('chat-input');
  });

  it('perplexity: lexical composer, Submit button, Model menu', () => {
    loadFixture('perplexity', 'perplexity.ai');
    const a = pickAdapter(deps);
    expect(a.id).toBe('perplexity');
    const [c] = a.composers();
    expect(c!.element.id).toBe('ask-input');
    expect(c!.sendButton?.getAttribute('aria-label')).toBe('Submit');
    expect(resolveModelLabel(BUNDLED, 'perplexity', a.currentModel(c!))).toBe('anthropic/claude-sonnet-5.5');
  });

  it('mistral: ProseMirror in a form with a Send button', () => {
    loadFixture('mistral', 'chat.mistral.ai');
    const a = pickAdapter(deps);
    expect(a.id).toBe('mistral');
    const [c] = a.composers();
    expect(c!.sendButton?.getAttribute('aria-label')).toBe('Send');
    expect(resolveModelLabel(BUNDLED, 'mistral', a.currentModel(c!))).toBe('mistralai/mistral-medium-3-5');
  });

  it('openrouter: composer-input textarea and model pill', () => {
    loadFixture('openrouter', 'openrouter.ai');
    const a = pickAdapter(deps);
    expect(a.id).toBe('openrouter');
    const [c] = a.composers();
    expect(c!.element.getAttribute('data-testid')).toBe('composer-input');
    expect(resolveModelLabel(BUNDLED, 'openrouter', a.currentModel(c!))).toBe('anthropic/claude-haiku-5.5');
  });

  it('deepseek: textarea and the pressed DeepThink toggle', () => {
    loadFixture('deepseek', 'chat.deepseek.com');
    const a = pickAdapter(deps);
    expect(a.id).toBe('deepseek');
    const [c] = a.composers();
    expect(c!.element.id).toBe('chat-input');
    expect(resolveModelLabel(BUNDLED, 'deepseek', a.currentModel(c!))).toBe('deepseek/deepseek-v4-pro');
  });

  it('copilot: userInput textarea and mode switcher', () => {
    loadFixture('copilot', 'copilot.microsoft.com');
    const a = pickAdapter(deps);
    expect(a.id).toBe('copilot');
    const [c] = a.composers();
    expect(c!.sendButton?.dataset.testid).toBe('submit-button');
    expect(resolveModelLabel(BUNDLED, 'copilot', a.currentModel(c!))).toBe('openai/gpt-6.1-sol');
  });

  it('poe: compare mode gives two composers with their own bots', () => {
    loadFixture('poe', 'poe.com');
    const a = pickAdapter(deps);
    expect(a.id).toBe('poe');
    const cs = a.composers();
    expect(cs.length).toBe(2);
    expect(cs[0]!.sendButton?.getAttribute('data-button-send')).toBe('true');
    expect(resolveModelLabel(BUNDLED, 'poe', a.currentModel(cs[0]!))).toBe('anthropic/claude-sonnet-5.5');
    expect(resolveModelLabel(BUNDLED, 'poe', a.currentModel(cs[1]!))).toBe('openai/gpt-6-luna');
  });

  it('attachments: hidden elements and file inputs are not counted', () => {
    loadFixture('chatgpt', 'chatgpt.com');
    const a = pickAdapter({ ...deps, isVisible: el => !el.hasAttribute('hidden') });
    const [c] = a.composers();
    const form = c!.container;
    form.insertAdjacentHTML('beforeend', '<div data-testid="file-attachment" hidden></div><input type="file" data-testid="attachment-input">');
    const before = a.attachments(c!).length;
    form.insertAdjacentHTML('beforeend', '<div data-testid="file-attachment">report.pdf</div>');
    expect(a.attachments(c!).length).toBe(before + 1);
  });

  it('content column is the composer\'s own form, not the first form on the page (ChatGPT sidebar)', () => {
    document.body.innerHTML = '<nav><form id="sidebar-search"><input></form></nav><main><form id="composer-form"><div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div><button data-testid="send-button"></button></form></main>';
    Object.defineProperty(window, 'location', { value: new URL('https://chatgpt.com/'), writable: true, configurable: true });
    const a = pickAdapter(deps);
    const [c] = a.composers();
    expect(a.contentColumn(c!).id).toBe('composer-form');
  });
});
