import type { Attachment, Classification, TaskType } from '../shared/types';
import { detectSensitive } from './sensitive';
import { KEYWORD_WEIGHT, PATTERN_WEIGHT, TASK_SIGNALS, keywordRegex } from './signals';
import { LONG_CONTEXT_TOKENS, LONG_PROMPT_TOKENS, estimateTokens, sizeBucket } from './tokens';

const HEAD = 50_000;
const TAIL = 10_000;

function trimForAnalysis(text: string): string {
  if (text.length <= HEAD + TAIL) return text;
  return text.slice(0, HEAD) + '\n' + text.slice(-TAIL);
}

export function classify(text: string, attachments: Attachment[] = []): Classification {
  const tokensIn = estimateTokens(text, attachments);
  const sample = trimForAnalysis(text);
  const low = sample.toLowerCase();
  const scores: Partial<Record<TaskType, number>> = {};
  const signals: string[] = [];

  for (const [task, sig] of Object.entries(TASK_SIGNALS) as [TaskType, typeof TASK_SIGNALS.code][]) {
    let s = 0;
    for (const kw of sig.keywords) {
      if (keywordRegex(kw).test(low)) { s += KEYWORD_WEIGHT; signals.push(`kw:${kw}`); }
    }
    for (const rx of sig.patterns) {
      if (rx.test(sample)) { s += PATTERN_WEIGHT; signals.push(`pattern:${task}`); }
    }
    if (s > 0) scores[task] = s;
  }

  const hasImage = attachments.some(a => a.kind === 'image');
  if (hasImage) {
    const top = Math.max(0, ...Object.values(scores));
    scores.vision = top + PATTERN_WEIGHT;        // an attached image dominates
    signals.push('attachment:image');
  }
  if (tokensIn > LONG_CONTEXT_TOKENS) {
    scores.long_context = Math.max(1, (Math.max(0, ...Object.values(scores))) * 0.5);
    signals.push('size:long_context');
  }

  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const weights: Partial<Record<TaskType, number>> = {};
  let primary: TaskType = 'chat';
  if (sum === 0 && tokensIn >= LONG_PROMPT_TOKENS) {
    // A substantial message with no task vocabulary is still not a quick question: weigh quality, not just price.
    weights.reasoning = 0.6; weights.chat = 0.4;
    primary = 'reasoning';
    signals.push('long prompt');
  } else if (sum === 0) {
    weights.chat = 1;
  } else {
    let best = 0;
    for (const [t, s] of Object.entries(scores) as [TaskType, number][]) {
      weights[t] = s / sum;
      if (s > best || (s === best && t === 'vision')) { best = s; primary = t; }
    }
  }

  return {
    primary, weights, tokensIn, size: sizeBucket(tokensIn),
    signals: [...new Set(signals)], sensitive: detectSensitive(sample),
  };
}
