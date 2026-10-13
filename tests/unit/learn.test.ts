import { describe, expect, it } from 'vitest';
import { LEARN_BOOST, learnBiases } from '../../src/analyser/learn';
import { scoreCandidates } from '../../src/analyser/score';
import type { UsageEvent } from '../../src/shared/types';
import { cand, cls, prefs } from './helpers';

const ev = (over: Partial<UsageEvent>): UsageEvent => ({ at: '2026-10-12T00:00:00Z', kind: 'outcome', site: 'claude', task: 'chat', suggested: 'a', ...over });

describe('learnBiases', () => {
  it('needs at least three overrides to the same model', () => {
    const two = [ev({ selected: 'b' }), ev({ selected: 'b' })];
    expect(learnBiases(two, 'claude', 'chat')).toEqual([]);
    const three = [...two, ev({ selected: 'b' })];
    const [b] = learnBiases(three, 'claude', 'chat', id => id.toUpperCase());
    expect(b).toMatchObject({ modelId: 'b', boost: LEARN_BOOST });
    expect(b!.reason).toContain('you usually pick B for quick chat');
  });
  it('ignores sends that simply followed the suggestion', () => {
    const followed = Array.from({ length: 5 }, () => ev({ selected: 'a', followed: true }));
    expect(learnBiases(followed, 'claude', 'chat')).toEqual([]);
  });
  it('requires a clear majority and scopes to site and task', () => {
    const mixed = [ev({ selected: 'b' }), ev({ selected: 'b' }), ev({ selected: 'b' }), ev({ selected: 'c' }), ev({ selected: 'c' }), ev({ selected: 'd' })];
    expect(learnBiases(mixed, 'claude', 'chat')).toEqual([]);   // 3/6 < 0.6
    const other = Array.from({ length: 3 }, () => ev({ selected: 'b', site: 'chatgpt' }));
    expect(learnBiases(other, 'claude', 'chat')).toEqual([]);
    expect(learnBiases(other, 'chatgpt', 'code')).toEqual([]);
  });
  it('turns repeated thumbs-down into a negative bias', () => {
    const votes = Array.from({ length: 3 }, () => ev({ kind: 'feedback', vote: 'down', suggested: 'a' }));
    const [b] = learnBiases(votes, 'claude', 'chat');
    expect(b).toMatchObject({ modelId: 'a', boost: -LEARN_BOOST });
    const balanced = [...votes, ev({ kind: 'feedback', vote: 'up', suggested: 'a' })];
    expect(learnBiases(balanced, 'claude', 'chat')).toEqual([]);
  });
  it('bias nudges the ranking and shows up as a reason', () => {
    const a = cand('a', { strengths: { chat: 0.9 }, price: { input: 1, output: 5 } });
    const b = cand('b', { strengths: { chat: 0.88 }, price: { input: 1, output: 5 } });
    const plain = scoreCandidates(cls('chat'), [a, b], prefs({ costWeight: 0 }), [], 'svc');
    expect(plain[0]!.modelId).toBe('a');
    const biased = scoreCandidates(cls('chat'), [a, b], prefs({ costWeight: 0 }), [], 'svc', [{ modelId: 'b', boost: LEARN_BOOST, reason: 'you usually pick b' }]);
    expect(biased[0]!.modelId).toBe('b');
    expect(biased[0]!.reasons).toContain('you usually pick b');
  });
});
