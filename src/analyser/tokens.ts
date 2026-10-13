import type { Attachment } from '../shared/types';

// Rough, dependency-free estimate (same chars/4 rule as Trioditis).
export const IMAGE_TOKENS = 1000;
export const FILE_TOKENS = 2000;
export const LONG_CONTEXT_TOKENS = 12000;

export function estimateTokens(text: string, attachments: Attachment[] = []): number {
  let n = Math.ceil(text.length / 4);
  for (const a of attachments) n += a.kind === 'image' ? IMAGE_TOKENS : FILE_TOKENS;
  return n;
}

export function sizeBucket(tokens: number): 'short' | 'medium' | 'long' {
  if (tokens <= 300) return 'short';
  if (tokens <= 3000) return 'medium';
  return 'long';
}
