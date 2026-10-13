import type { TaskType } from '../shared/types';

export interface TaskSignals { keywords: string[]; patterns: RegExp[] }

export const KEYWORD_WEIGHT = 1;
export const PATTERN_WEIGHT = 2;

// Seeded from the Trioditis routes (code / reasoning / writing / quick) and
// extended with the task types the extension distinguishes.
export const TASK_SIGNALS: Record<Exclude<TaskType, 'vision' | 'long_context' | 'chat'>, TaskSignals> = {
  code: {
    keywords: ['code', 'function', 'bug', 'error', 'stack trace', 'python', 'javascript', 'typescript',
      'sql', 'regex', 'refactor', 'unit test', 'api', 'docker', 'bash', 'compile', 'exception',
      'script', 'debug', 'implement', 'class', 'method', 'library', 'npm', 'git', 'html', 'css',
      'react', 'rust', 'golang', 'java', 'c++', 'endpoint', 'json', 'yaml', 'config', 'lint'],
    patterns: [/```/, /Traceback \(most recent call last\)/, /\bdef \w+\(/, /\bclass \w+/,
      /\bfunction \w+\s*\(/, /=>\s*{/, /\bimport \w+ from\b/, /\bSELECT\b.+\bFROM\b/i,
      /\bconsole\.log\b/, /\bnull pointer\b/i, /\bTypeError\b|\bReferenceError\b|\bSyntaxError\b/],
  },
  reasoning: {
    keywords: ['prove', 'proof', 'calculate', 'probability', 'equation', 'step by step', 'optimize',
      'optimise', 'trade-off', 'tradeoff', 'derive', 'logic puzzle', 'theorem', 'integral',
      'strategy', 'plan', 'why does', 'explain why', 'compare', 'evaluate', 'reason', 'analyse',
      'analyze', 'decide', 'pros and cons', 'estimate', 'riddle', 'math', 'solve'],
    patterns: [/\d+\s*[+\-*/^]\s*\d+/, /\b\d+\s*%/, /[∑∫√≤≥≠]/],
  },
  writing: {
    keywords: ['email', 'draft', 'rewrite', 'rephrase', 'essay', 'blog', 'post', 'tone', 'proofread',
      'cover letter', 'linkedin', 'write', 'story', 'poem', 'headline', 'copy', 'tagline',
      'article', 'paragraph', 'edit', 'grammar', 'polish', 'persuasive', 'formal', 'casual',
      'newsletter', 'announcement', 'speech', 'bio'],
    patterns: [/\bmake (it|this) (sound|read)\b/i, /\bin the (voice|style) of\b/i],
  },
  summarise: {
    keywords: ['summarize', 'summarise', 'summary', 'tl;dr', 'tldr', 'key points', 'bullet points',
      'recap', 'condense', 'shorten', 'gist', 'main takeaways', 'abstract', 'digest', 'outline'],
    patterns: [/\bin (one|two|three|\d+) (sentence|line|bullet)s?\b/i],
  },
  translate: {
    keywords: ['translate', 'translation', 'in french', 'in spanish', 'in german', 'in italian',
      'in portuguese', 'in polish', 'in dutch', 'in japanese', 'in chinese', 'in korean',
      'in russian', 'in arabic', 'in hindi', 'to english', 'into english', 'localize', 'localise'],
    patterns: [/\bfrom \w+ (to|into) \w+\b/i, /\btranslat(e|ion) (to|into)\b/i,
      /\b(in|into|to) (french|spanish|german|italian|portuguese|polish|dutch|japanese|chinese|mandarin|korean|russian|ukrainian|arabic|hindi|english|czech|swedish|turkish|greek|norwegian|danish|finnish)\b/i],
  },
  data: {
    keywords: ['csv', 'spreadsheet', 'excel', 'column', 'row', 'pivot', 'chart', 'dataset', 'table',
      'json array', 'parse', 'extract', 'classify', 'categorize', 'categorise', 'dedupe',
      'normalize', 'normalise', 'statistics', 'average', 'median', 'aggregate', 'group by',
      'filter', 'sort', 'convert to', 'schema', 'fields'],
    patterns: [/(^|\n)([^\n,]+,){3,}[^\n]*\n([^\n,]+,){3,}/, /(^|\n)\|.+\|.+\|\s*\n\|?\s*-{2,}/,
      /\[\s*{[^}]*}\s*,\s*{/, /\t[^\t\n]+\t[^\t\n]+\t/],
  },
};

const wordRx = new Map<string, RegExp>();
export function keywordRegex(kw: string): RegExp {
  let rx = wordRx.get(kw);
  if (!rx) {
    rx = new RegExp(`(?<![\\w])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`);
    wordRx.set(kw, rx);
  }
  return rx;
}
