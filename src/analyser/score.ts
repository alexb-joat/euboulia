import type { Candidate, Classification, Prefs, Ranked, Rule, TaskType } from '../shared/types';
import { estimateCost } from './cost';
import type { Bias } from './learn';
import { applyRules } from './rules';

const DEFAULT_STRENGTH = 0.5;
const CONTEXT_MARGIN = 1.2;

export function fitScore(cls: Classification, strengths: Candidate['model']['strengths']): number {
  let fit = 0;
  for (const [t, w] of Object.entries(cls.weights) as [TaskType, number][]) {
    fit += w * (strengths[t] ?? DEFAULT_STRENGTH);
  }
  return fit;
}

/** Log-scaled 0..1 across the candidate set: 1 = cheapest, 0 = dearest. */
function costScores(ranked: Omit<Ranked, 'costScore' | 'total'>[]): number[] {
  const usds = ranked.map(r => r.cost.kind === 'api' ? r.cost.usd : r.cost.kind === 'included' ? r.cost.apiUsd : undefined);
  const known = usds.filter((u): u is number => u !== undefined && u > 0);
  const min = known.length ? Math.min(...known) : 0;
  const max = known.length ? Math.max(...known) : 0;
  const span = min > 0 ? Math.log(max / min) : 0;
  return ranked.map((r, i) => {
    const c = r.cost;
    if (c.kind === 'included') {
      // Already paid for; a heavier cap weight costs a little.
      return Math.max(0.4, Math.min(1, 1 - 0.3 * (c.capWeight - 1)));
    }
    if (c.kind === 'unknown') return 0.5;
    const u = usds[i]!;
    if (u === 0 || span === 0) return 1;
    return 1 - Math.log(u / min) / span;
  });
}

export function scoreCandidates(
  cls: Classification, candidates: Candidate[], prefs: Prefs, rules: Rule[], site: string, biases: Bias[] = [],
): Ranked[] {
  const effects = applyRules(rules, { cls, site });
  const biasFor = new Map(biases.map(b => [b.modelId, b]));
  const partial: Omit<Ranked, 'costScore' | 'total'>[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    if (effects.excluded.has(c.modelId)) continue;
    if ((cls.weights.vision ?? 0) > 0 && !c.model.capabilities.includes('vision')) continue;
    const cost = estimateCost(c.model, cls.tokensIn, cls.primary, c.plan, c.capWeight);
    if (c.model.context < cls.tokensIn * CONTEXT_MARGIN + cost.tokensOut) continue;
    const fit = fitScore(cls, c.model.strengths);
    partial.push({ ...c, fit, cost, reasons });
  }
  const cs = costScores(partial);
  const lambda = Math.min(1, Math.max(0, prefs.costWeight));
  const ranked: Ranked[] = partial.map((p, i) => {
    const boost = effects.boosts.get(p.modelId);
    const bias = biasFor.get(p.modelId);
    const total = (1 - lambda) * p.fit + lambda * cs[i]! + (boost?.boost ?? 0) + (bias?.boost ?? 0);
    if (boost) p.reasons.push(`your rule "${boost.ruleId}" prefers it`);
    if (bias && bias.boost > 0) p.reasons.push(bias.reason);
    return { ...p, costScore: cs[i]!, total };
  });
  ranked.sort((a, b) => b.total - a.total);
  return ranked;
}
