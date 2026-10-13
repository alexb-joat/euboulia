import { describe, expect, it } from 'vitest';
import { classify } from '../../src/analyser/classify';

describe('classify', () => {
  it.each([
    ['Why does this Python function throw a KeyError?\n```py\ndef f(d):\n  return d["x"]\n```', 'code'],
    ['Write a SQL query that returns the top 10 customers by revenue', 'code'],
    ['What is the probability of drawing two aces in a row? Explain step by step.', 'reasoning'],
    ['Draft a short follow-up email after a sales call, friendly tone', 'writing'],
    ['Summarize this article in three bullet points: ...', 'summarise'],
    ['Translate the following paragraph into French', 'translate'],
    ['Here is a CSV, group by region and give me the average order value\nid,region,value,date\n1,EU,10,2026-01-01\n2,US,20,2026-01-02', 'data'],
    ["What's the capital of Portugal?", 'chat'],
  ])('%s -> %s', (text, task) => {
    expect(classify(text).primary).toBe(task);
  });

  it('forces vision when an image is attached', () => {
    const c = classify('refactor this function', [{ kind: 'image' }]);
    expect(c.primary).toBe('vision');
    expect(c.weights.code).toBeGreaterThan(0);
    expect(c.signals).toContain('attachment:image');
  });

  it('flags long context and keeps the primary task', () => {
    const c = classify('Summarise the key points of this report:\n' + 'lorem ipsum '.repeat(6000));
    expect(c.tokensIn).toBeGreaterThan(12000);
    expect(c.weights.long_context).toBeGreaterThan(0);
    expect(c.primary).toBe('summarise');
    expect(c.size).toBe('long');
  });

  it('returns chat with no signals for empty text', () => {
    const c = classify('');
    expect(c.primary).toBe('chat');
    expect(c.weights).toEqual({ chat: 1 });
    expect(c.signals).toEqual([]);
  });

  it('never leaks matched text into signals', () => {
    const c = classify('my password: hunter2 and email a@b.co');
    expect(c.sensitive).toEqual(expect.arrayContaining(['email', 'password_assignment']));
    expect(JSON.stringify(c)).not.toContain('hunter2');
  });
});
